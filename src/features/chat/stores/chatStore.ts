/** Chat Zustand store; the composer ref, abort controller, and injected providers live in module refs. */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { MutableRefObject } from 'react';
import type { ChatSession, ChatMessage, ChatMetadata, ChatPart, AppSettings, FileUIPart, ReasoningEffort } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { chatService } from '@services/chat.service';
import { resolveChatExtrasModel, resolveChatModel } from '@shared/utils/modelResolver';
import type { StreamProgress } from '@services/ai/types';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate } from '@extensions/tool-orchestrator';
import { streamingStore } from './streamingStore';
import { formatChatTimeContext, type ChatToolset } from '@core/ai';
import { generateChatExtras } from '@services/ai/chatExtras';
import { logUsage } from '@extensions/usage';
import { fileToBase64 } from '@shared/utils/file.utils';
import { queryClient } from '@shared/query/queryClient';
import { useAppStore } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { itemCountsQuery, itemEdits, refreshItems } from '@shared/query/items';
import { CHAT_MAX_ATTACHMENTS } from '@config/chat.config';
import { UI_CONFIG } from '@config/ui.config';
import { canSendDraft, chatModelOf, draftTitle } from '@features/chat/utils';
import type { ModelRef } from '@services/ai/models';
import { errorMessage } from '@shared/utils/errors';
import { messageText } from '@shared/utils/chatParts';

/** "Reply ready" while Roci is in the background (Settings › Notifications › Chat replies). */
function notifyReply(sessionId: string, text: string): void {
  const max = NOTIFICATIONS_CONFIG.chat.bodyMaxChars;
  const body = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  notifyAppEvent({ id: `chat:${sessionId}`, kind: 'chatReplies', tone: 'success', inFront: 'quiet', title: 'Reply ready', body });
}

// ── Module-level refs ──

/** The mounted chat composer's textarea (⌘L focus target). */
const chatInputRef: MutableRefObject<HTMLTextAreaElement | null> = { current: null };

/** ⌘L arrived while no composer was mounted; the next one to mount takes focus. */
let composerFocusPending = false;

/** Focus the composer (⌘L); with none on screen, navigate to one and focus it as it mounts. */
export function focusChatComposer(): void {
  if (chatInputRef.current) {
    chatInputRef.current.focus();
    return;
  }
  composerFocusPending = true;
  const { selectedHistoryId, setCurrentView, setMeetingChatOpen } = useAppStore.getState();
  setCurrentView('home');
  if (selectedHistoryId) setMeetingChatOpen(true);
}

/** The meeting chat full screen: the same chat, now the selected one in the sidebar (or the home composer if unsent). */
export function expandMeetingChat(): void {
  const app = useAppStore.getState();
  const { currentSessionId } = useChatStore.getState();
  app.setMeetingChatOpen(false);
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setStatus(currentSessionId ? AppStatus.CHAT : AppStatus.IDLE);
}

/** Closes the meeting chat; an unsent draft (and its meeting chip) goes with it. */
export function closeMeetingChat(): void {
  useAppStore.getState().setMeetingChatOpen(false);
  const chat = useChatStore.getState();
  if (chat.currentSessionId) return;
  chat.newChat();
  chat.setSelectedMeetingRefs([]);
}

/** Sends in a fresh chat on home: the composer's draft, or `text` (`roci://ask`). The draft is read before anything is reset. */
export function askInNewChat(text?: string): void {
  startNewChat();
  useChatStore.setState({ draftMeetingId: null });
  useAppStore.getState().setStatus(AppStatus.CHAT);
  void useChatStore.getState().sendMessage(text);
}

/** Back to the empty home composer: no meeting, session, or result selected (⌘N, New chat). */
export function startNewChat(): void {
  const app = useAppStore.getState();
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setStatus(AppStatus.IDLE);
  useChatStore.getState().setCurrentSessionId(null);
}

/** Opens a saved chat in the main view (the sidebar's chats, the gallery's "Open chat"). */
export function openChat(sessionId: string): void {
  useChatStore.getState().selectSession(sessionId);
  const app = useAppStore.getState();
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setStatus(AppStatus.CHAT);
}

/** ChatInput registers its textarea on mount (null on unmount). */
export function registerChatComposer(textarea: HTMLTextAreaElement | null): void {
  chatInputRef.current = textarea;
  if (!textarea || !composerFocusPending) return;
  composerFocusPending = false;
  textarea.focus();
}

/** The pending "Copied" reset; a newer copy replaces it. */
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

/** Injected by useChatRuntime from Settings. */
const injectedRefs = {
  settings: null as AppSettings | null,
  providers: null as ModelProvider[] | null,
};

// ── The reply in flight ──

/** The one reply being generated: its chat, its message, and its own Stop. */
interface Reply {
  sessionId: string;
  messageId: string;
  controller: AbortController;
}

let activeReply: Reply | null = null;

/** Still the reply in flight and not stopped; a stopped or finished reply writes nothing more. */
const isLive = (reply: Reply): boolean => activeReply === reply && !reply.controller.signal.aborted;

function beginReply(sessionId: string): Reply {
  const reply = { sessionId, messageId: (Date.now() + 1).toString(), controller: new AbortController() };
  activeReply = reply;
  useChatStore.setState({ replyingSessionId: sessionId, aiActivity: null });
  return reply;
}

function endReply(reply: Reply): void {
  if (activeReply !== reply) return;
  activeReply = null;
  useChatStore.setState({ replyingSessionId: null, aiActivity: null });
}

// ── Chat writes: the store first, then every list reads it again (renames and deletes already show, via itemEdits) ──

/** One chat write; never rejects. */
async function writeChat(write: () => Promise<void>, what: string): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error: unknown) {
    console.error(`[ChatStore] Failed to ${what}:`, error);
    return false;
  } finally {
    refreshItems();
  }
}

// ── Session helpers ──

const sessionOf = (id: string): ChatSession | undefined => useChatStore.getState().loadedSessions.get(id);

/** Puts a session into the in-memory map, replacing the old copy (no save). */
function putSession(session: ChatSession): void {
  useChatStore.setState((state) => ({ loadedSessions: new Map(state.loadedSessions).set(session.id, session) }));
}

/** Changes one message of a loaded session in memory; returns the updated session. */
function patchMessage(sessionId: string, messageId: string, patch: (message: ChatMessage) => ChatMessage): ChatSession | undefined {
  const session = sessionOf(sessionId);
  if (!session) return undefined;
  const updated = { ...session, messages: session.messages.map((m) => (m.id === messageId ? patch(m) : m)) };
  putSession(updated);
  return updated;
}

const withMetadata = (message: ChatMessage, metadata: Partial<ChatMetadata>): ChatMessage =>
  ({ ...message, metadata: { ...message.metadata, ...metadata } });

/** A reply settled with these parts and metadata. */
function settle(sessionId: string, messageId: string, parts: ChatPart[], metadata: Partial<ChatMetadata> = {}): ChatSession | undefined {
  return patchMessage(sessionId, messageId, (m) => ({ ...withMetadata(m, { ...metadata, state: 'complete' }), parts }));
}

const isUnsettled = ({ metadata }: ChatMessage): boolean => metadata.state === 'loading' || metadata.state === 'streaming';

/** The one save path, used whenever a message settles. Disk only ever holds settled messages. */
function saveSession(session: ChatSession | undefined): void {
  if (!session) return;
  void useChatStore.getState().persistSession({ ...session, messages: session.messages.filter((m) => !isUnsettled(m)) });
}

/** Earlier replies' follow-up suggestions go once a new question is asked. */
const withoutSuggestions = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => {
    if (!message.metadata.suggestions?.length) return message;
    const { suggestions: _, ...metadata } = message.metadata;
    return { ...message, metadata };
  });

/** What one send carries. */
interface Question {
  text: string;
  attachments: FileUIPart[];
  meetings: MeetingListItem[];
}

/** The composer's whole draft, or only `textOverride` (a suggestion, `roci://ask`), which leaves the draft alone. */
function questionToSend(textOverride: string | undefined): Question {
  if (textOverride !== undefined) return { text: textOverride.trim(), attachments: [], meetings: [] };
  const { input, pendingAttachments, selectedMeetingRefs } = useChatStore.getState();
  return { text: input.trim(), attachments: pendingAttachments, meetings: selectedMeetingRefs };
}

/** The question as a message: when it was sent (for the model), its text, then its attachments and chosen meetings. */
function questionMessage({ text, attachments, meetings }: Question): ChatMessage {
  const now = Date.now();
  return {
    id: now.toString(),
    role: 'user',
    parts: [{ type: 'data-sentAt', data: { at: now } }, ...(text ? [{ type: 'text' as const, text }] : []), ...attachments],
    metadata: {
      createdAt: now,
      ...(meetings.length > 0 && { meetingRefs: meetings.map((m) => ({ id: m.id, title: m.title })) }),
    },
  };
}

/** The chat a question goes into: the current one, or a new one built from the draft. */
function targetSessionFor({ text, attachments }: Question): ChatSession | undefined {
  const { currentSessionId, draftMeetingId, draftReasoningEffort } = useChatStore.getState();
  if (currentSessionId) return sessionOf(currentSessionId);
  return {
    id: Date.now().toString(),
    title: draftTitle(text, attachments),
    lastMessageAt: Date.now(),
    messages: [],
    ...(draftMeetingId && { meetingId: draftMeetingId }),
    ...(draftReasoningEffort !== 'provider-default' && { reasoningEffort: draftReasoningEffort }),
  };
}

// ── Generating a reply ──

/** What a reply stopped before its first word says. */
const STOPPED_REPLY = '[Stopped]';
const NO_MODEL_REPLY = 'Please select a model from the picker in the toolbar before sending a message.';
const lockedModelGoneReply = ({ model }: ModelRef) =>
  `This chat runs on ${model}, which isn't available now. Start a new chat to use another model.`;

/** Everything a reply needs besides its Reply handle. */
interface ReplyRequest {
  session: ChatSession;
  question: Question;
  resolved: NonNullable<ReturnType<typeof resolveChatModel>>;
  settings: AppSettings;
  providers: ModelProvider[];
  isNewSession: boolean;
}

/** When the reply's first word arrived. */
interface StreamTally {
  firstTextAt: number;
}

/** The conversation with the question carrying its attached meetings, recorded on it (saved when the reply settles) so
 *  every later turn sends them with it. */
function withMeetingContext(reply: Reply, messages: ChatMessage[], meetingContext: string): ChatMessage[] {
  const question = messages.at(-1);
  if (!question) return messages;
  const withMeetings = (m: ChatMessage): ChatMessage => ({ ...m, parts: [...m.parts, { type: 'data-meetings', data: { context: meetingContext } }] });
  patchMessage(reply.sessionId, question.id, withMeetings);
  return [...messages.slice(0, -1), withMeetings(question)];
}

/** Streams the reply into `streamingStore`; every callback is a no-op once the reply is stopped. */
async function streamReply(reply: Reply, request: ReplyRequest, tally: StreamTally) {
  const { session, question, resolved, settings, providers } = request;
  const signal = reply.controller.signal;

  const context = await contextPipeline.resolve({
    meetingIds: question.meetings.map((m) => m.id),
    signal,
  });
  if (!isLive(reply)) return null;
  const messages = context.text ? withMeetingContext(reply, session.messages, context.text) : session.messages;

  streamingStore.start(reply.messageId);
  let streaming = false;
  /** The reply's first content (text, thinking or a tool call) switches it from loading to streaming. */
  const markStreaming = () => {
    if (streaming) return;
    streaming = true;
    useChatStore.setState({ aiActivity: null });
    patchMessage(reply.sessionId, reply.messageId, (m) => withMetadata(m, { state: 'streaming' }));
  };

  return orchestrate(
    {
      messages,
      messageId: reply.messageId,
      model: resolved,
      prompt: {
        meetingCount: (await queryClient.fetchQuery(itemCountsQuery)).meetings,
        timeContext: formatChatTimeContext(),
      },
      settings,
      providers,
      signal,
      reasoningEffort: session.reasoningEffort ?? 'provider-default',
    },
    {
      onParts: (parts) => {
        if (!isLive(reply) || parts.length === 0) return;
        markStreaming();
        if (tally.firstTextAt === 0 && messageText({ parts })) tally.firstTextAt = Date.now();
        streamingStore.update(parts);
      },
      onProgress: (progress) => {
        if (isLive(reply)) useChatStore.setState({ aiActivity: progress });
      },
      onGeneration: (stats) => {
        if (isLive(reply)) streamingStore.setGeneration(stats);
      },
    }
  );
}

/** Output tokens per second of streamed text, when it streamed long enough to measure. */
function tokensPerSecond(tokens: number | undefined, firstTextAt: number): number | undefined {
  const seconds = firstTextAt > 0 ? (Date.now() - firstTextAt) / 1000 : 0;
  return tokens && seconds > 0.05 ? Math.round(tokens / seconds) : undefined;
}

/** Once a reply has finished: one call names a new chat and/or suggests follow-ups, as Settings › Default Models › Titles &
 *  follow-ups say (its model, else the chat's own); best-effort, and none at all when both are off. */
function afterReply(reply: Reply, request: ReplyRequest, text: string, tools: ChatToolset): void {
  const { session, question, settings, providers, isNewSession } = request;
  const want = { title: isNewSession && settings.chatTitles !== false, suggestions: settings.followUps !== false };
  if (!want.title && !want.suggestions) return;
  generateChatExtras({
    resolved: resolveChatExtrasModel(settings, providers) ?? request.resolved,
    want,
    question: question.text || session.title,
    reply: text,
    tools,
    sessionId: reply.sessionId,
  })
    .then(({ title, suggestions }) => {
      if (title) useChatStore.getState().renameSession(reply.sessionId, title);
      if (suggestions.length > 0) saveSession(patchMessage(reply.sessionId, reply.messageId, (m) => withMetadata(m, { suggestions })));
    })
    .catch((error: unknown) => console.error('[ChatStore] Titles & follow-ups failed:', error));
}

/** Runs one reply to its end: complete, failed, or (via Stop) settled elsewhere. Every outcome is saved once. */
async function generateReply(reply: Reply, request: ReplyRequest): Promise<void> {
  const tally: StreamTally = { firstTextAt: 0 };
  try {
    const result = await streamReply(reply, request, tally);
    if (!result || !isLive(reply)) return; // Stop settled and saved it.

    logUsage({ category: 'chat', sessionId: reply.sessionId, provider: result.provider, model: result.model, usage: result.tokenUsage })
      .catch((e: unknown) => console.error('[UsageLog] chat:', e));

    streamingStore.finish();
    const { parts, tokenUsage: usage, context } = result;
    saveSession(settle(reply.sessionId, reply.messageId, parts, {
      tokensPerSecond: tokensPerSecond(usage?.outputTokens, tally.firstTextAt),
      context,
      usage,
    }));
    endReply(reply);
    const text = messageText({ parts });
    notifyReply(reply.sessionId, text);
    afterReply(reply, request, text, result.toolset);
  } catch (error: unknown) {
    if (!isLive(reply)) return; // Stopped: the abort surfaced as an error, and Stop already settled it.
    console.error('[ChatStore] Error sending message:', error);
    streamingStore.reset();
    const text = errorMessage(error) || 'Failed to get response';
    saveSession(settle(reply.sessionId, reply.messageId, [{ type: 'text', text }], { isError: true }));
    endReply(reply);
  }
}

// ── Types ──

export interface ChatStoreState {
  loadedSessions: Map<string, ChatSession>;
  currentSessionId: string | null;
  isSessionLoading: boolean;
  input: string;
  /** The chat whose reply is being generated (one at a time); null when none is. */
  replyingSessionId: string | null;
  copiedMessageId: string | null;
  selectedMeetingRefs: MeetingListItem[];
  /** The meeting a not-yet-sent chat belongs to (meeting chat); the first message saves the chat linked to it. */
  draftMeetingId: string | null;
  /** The thinking level picked before a new chat exists; the chat keeps it once created. */
  draftReasoningEffort: ReasoningEffort;
  /** What happens before the reply's first word (the model list, a model load, reading the prompt). */
  aiActivity: StreamProgress | null;
  pendingAttachments: FileUIPart[];

  setInput: (input: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  newChat: () => void;
  /** Sends the composer's draft (or only `textOverride`, e.g. a suggestion) in the current chat, or a new one. */
  sendMessage: (textOverride?: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  /** Deletes a chat; throws when the store refused, after the list is rolled back. */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Drops chats the store already removed (Keep, Delete All) from memory, leaving an open one, so no save brings them back. */
  forgetSessions: (sessionIds: string[]) => void;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  /** Stops the reply in flight, wherever it is, keeping what it has written so far. */
  stopGeneration: () => void;
  copyMessage: (messageId: string, text: string) => void;
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  /** Sets the current chat's thinking level (saved with the chat), or the new chat's before it exists. */
  setReasoningEffort: (effort: ReasoningEffort) => void;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  addScreenshotAttachment: (base64: string, name: string) => void;
  /** A fresh, unsaved chat about `meeting`, with the meeting attached as context. */
  startMeetingChat: (meeting: MeetingListItem) => void;
  /** Writes a session to disk and its row to the chat list; never rejects. */
  persistSession: (session: ChatSession) => Promise<void>;
  /** Changes the chats in memory (useChatRuntime: the open chat loaded, others let go). */
  setLoadedSessions: (updater: (prev: Map<string, ChatSession>) => Map<string, ChatSession>) => void;
}

// ── Store ──

/** An attachment as the AI SDK's file part: the file inline as a data URL, with its name. */
function attachmentPart(mediaType: string, base64: string, filename: string): FileUIPart {
  return { type: 'file', mediaType, url: `data:${mediaType};base64,${base64}`, filename };
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  // ── State ──

  loadedSessions: new Map(),
  currentSessionId: null,
  isSessionLoading: false,
  input: '',
  replyingSessionId: null,
  copiedMessageId: null,
  selectedMeetingRefs: [],
  draftMeetingId: null,
  draftReasoningEffort: 'provider-default',
  aiActivity: null,
  pendingAttachments: [],

  // ── Session management ──

  setInput: (input) => set({ input }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setLoadedSessions: (updater) => set((state) => ({ loadedSessions: updater(state.loadedSessions) })),

  newChat: () =>
    set({
      draftMeetingId: null,
      currentSessionId: null,
      draftReasoningEffort: 'provider-default',
      input: '',
    }),

  selectSession: (sessionId) =>
    set((state) => ({ currentSessionId: sessionId, isSessionLoading: !state.loadedSessions.has(sessionId) })),

  deleteSession: async (sessionId) => {
    if (activeReply?.sessionId === sessionId) get().stopGeneration();
    set((state) => {
      const loadedSessions = new Map(state.loadedSessions);
      loadedSessions.delete(sessionId);
      return { loadedSessions, currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId };
    });
    await itemEdits.remove(sessionId);
    const deleted = await writeChat(() => chatService.deleteSession(sessionId), 'delete chat');
    if (!deleted) throw new Error(`Chat ${sessionId} was not deleted`);
  },

  forgetSessions: (sessionIds) => {
    const gone = new Set(sessionIds);
    if (gone.has(get().currentSessionId ?? '')) startNewChat();
    set((state) => ({ loadedSessions: new Map([...state.loadedSessions].filter(([id]) => !gone.has(id))) }));
  },

  renameSession: async (sessionId, newTitle) => {
    // Memory first, so a save landing during the rename writes the new title too.
    const existing = sessionOf(sessionId);
    if (existing) putSession({ ...existing, title: newTitle });
    await itemEdits.rename(sessionId, newTitle);
    await writeChat(() => chatService.renameSession(sessionId, newTitle), 'rename chat');
  },

  copyMessage: (messageId, text) => {
    navigator.clipboard.writeText(text).catch((error: unknown) =>
      console.error('[ChatStore] Failed to copy message:', error)
    );
    set({ copiedMessageId: messageId });
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => set({ copiedMessageId: null }), UI_CONFIG.copiedFeedbackMs);
  },

  setSelectedMeetingRefs: (selectedMeetingRefs) => set({ selectedMeetingRefs }),

  setReasoningEffort: (effort) => {
    const { currentSessionId } = get();
    const session = currentSessionId ? sessionOf(currentSessionId) : undefined;
    if (!session) {
      set({ draftReasoningEffort: effort });
      return;
    }
    // In memory at once, so the very next message uses it; then saved.
    const updated = { ...session, reasoningEffort: effort };
    putSession(updated);
    saveSession(updated);
  },

  // ── Persist ──

  persistSession: async (session) => {
    await writeChat(() => chatService.persistSession(session), 'save chat');
  },

  // ── Attachments ──

  addAttachment: async (file) => {
    if (get().pendingAttachments.length >= CHAT_MAX_ATTACHMENTS) return;
    try {
      const part = attachmentPart(file.type || 'application/octet-stream', await fileToBase64(file), file.name);
      set((state) => ({ pendingAttachments: [...state.pendingAttachments, part] }));
    } catch (error: unknown) {
      console.error('[ChatStore] Failed to add attachment:', error);
    }
  },

  removeAttachment: (index) =>
    set((state) => ({ pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index) })),

  addScreenshotAttachment: (base64, name) =>
    set((state) => {
      if (state.pendingAttachments.length >= CHAT_MAX_ATTACHMENTS) return state;
      const part = attachmentPart('image/png', base64, name);
      return { pendingAttachments: [...state.pendingAttachments, part] };
    }),

  startMeetingChat: (meeting) =>
    set({
      currentSessionId: null,
      draftMeetingId: meeting.id,
      selectedMeetingRefs: [meeting],
      input: '',
      pendingAttachments: [],
      draftReasoningEffort: 'provider-default',
    }),

  // ── Send Message ──

  sendMessage: async (textOverride) => {
    if (get().replyingSessionId) return;
    const question = questionToSend(textOverride);
    if (!canSendDraft(question.text, question.attachments)) return;
    const target = targetSessionFor(question);
    if (!target) {
      console.error('[ChatStore] sendMessage: session not loaded', get().currentSessionId);
      return;
    }

    const isNewSession = !get().currentSessionId;
    const session: ChatSession = {
      ...target,
      messages: [...withoutSuggestions(target.messages), questionMessage(question)],
      lastMessageAt: Date.now(),
    };
    putSession(session);
    set({
      currentSessionId: session.id,
      ...(textOverride === undefined && { input: '', pendingAttachments: [], selectedMeetingRefs: [] }),
      ...(isNewSession && { draftMeetingId: null, draftReasoningEffort: 'provider-default' as const }),
    });
    const reply = beginReply(session.id);
    await get().persistSession(session);
    if (!isLive(reply)) return;

    const { settings, providers } = injectedRefs;
    // A chat keeps the model of its first reply; a new chat takes the chat model setting.
    const locked = chatModelOf(session);
    const resolved = settings ? resolveChatModel(settings, providers || [], locked) : null;
    const answer: ChatMessage = { id: reply.messageId, role: 'assistant', parts: [], metadata: { createdAt: Date.now() } };
    if (!settings || !resolved) {
      const text = locked ? lockedModelGoneReply(locked) : NO_MODEL_REPLY;
      const notice: ChatMessage = { ...answer, parts: [{ type: 'text', text }], metadata: { createdAt: Date.now(), state: 'complete' } };
      const hinted: ChatSession = { ...session, messages: [...session.messages, notice] };
      putSession(hinted);
      saveSession(hinted);
      endReply(reply);
      return;
    }

    // The reply's placeholder lives in memory only; it is saved once it settles.
    putSession({
      ...session,
      messages: [...session.messages, { ...answer, metadata: { createdAt: Date.now(), provider: resolved.provider, model: resolved.modelId, state: 'loading' } }],
    });
    await generateReply(reply, { session, question, resolved, settings, providers: providers || [], isNewSession });
  },

  stopGeneration: () => {
    const reply = activeReply;
    if (!reply) return;
    reply.controller.abort();
    const parts = streamingStore.finish();
    saveSession(settle(reply.sessionId, reply.messageId, messageText({ parts }) ? parts : [...parts, { type: 'text', text: STOPPED_REPLY }]));
    endReply(reply);
  },
}));

// ── Injection ──

export function injectChatRefs(refs: {
  settings: AppSettings | null;
  providers: ModelProvider[] | null;
}) {
  Object.assign(injectedRefs, refs);
}

// ── Selectors ──

export const useChatCurrentSessionId = () => useChatStore((s) => s.currentSessionId);

/** The current chat's thinking level, or the level picked for the chat about to start. */
export const useChatReasoningEffort = () =>
  useChatStore((s) => {
    const session = s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined;
    return session ? session.reasoningEffort ?? 'provider-default' : s.draftReasoningEffort;
  });

/** The provider and model the open chat is locked to; null for a new chat (it takes the chat model setting). */
export const useChatModelLock = (): ModelRef | null =>
  useChatStore(useShallow((s) => chatModelOf(s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined) ?? null));

/** The open chat, or null before one is chosen or while it loads. */
export const useCurrentSession = (): ChatSession | null =>
  useChatStore(useShallow((s) => (s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) ?? null : null)));
