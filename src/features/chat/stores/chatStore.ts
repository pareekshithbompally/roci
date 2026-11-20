/** Chat Zustand store; the composer ref, abort controller, and injected providers live in module refs. */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { MutableRefObject } from 'react';
import type {
  ChatSession,
  ChatMessage,
  ChatPart,
  AppSettings,
  MeetingCitation,
  WebCitation,
  InlineCitationSpan,
  ReasoningEffort,
} from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { chatService } from '@services/chat.service';
import { resolveChatExtrasModel, resolveChatModel } from '@shared/utils/modelResolver';
import type { StreamMetadata } from '@services/ai/types';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate } from '@extensions/tool-orchestrator';
import { streamingStore } from './streamingStore';
import type { ToolCallPatch } from './streamingStore';
import type { ToolActivity } from '@extensions/tool-orchestrator/types';
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
import { CHAT_MAX_ATTACHMENTS, TOOL_RESULT_PREVIEW_CHARS } from '@config/chat.config';
import { UI_CONFIG } from '@config/ui.config';
import { canSendDraft, chatModelOf, draftTitle } from '@features/chat/utils';
import type { ModelRef } from '@services/ai/models';
import { errorMessage } from '@shared/utils/errors';

/** "Reply ready" while Roci is in the background (Settings › Notifications › Chat replies). */
function notifyReply(sessionId: string, text: string): void {
  const max = NOTIFICATIONS_CONFIG.chat.bodyMaxChars;
  const body = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  notifyAppEvent({ id: `chat:${sessionId}`, kind: 'chatReplies', tone: 'success', inFront: 'quiet', title: 'Reply ready', body });
}

/** What one tool event changes on its row in the streaming message. */
function toolCallPatch(activity: ToolActivity): ToolCallPatch {
  const { toolName, source } = activity;
  switch (activity.phase) {
    case 'start':
      return { toolName, source, status: 'calling' };
    case 'input':
      return { toolName, source, arguments: activity.arguments };
    case 'end': {
      const { content, isError, executionMs } = activity.result;
      return {
        toolName,
        source,
        ...(activity.arguments && { arguments: activity.arguments }),
        status: isError ? 'error' : 'complete',
        result: { content: content.slice(0, TOOL_RESULT_PREVIEW_CHARS), isError, executionMs },
      };
    }
  }
}

/** Adds a tool's meeting citations, keeping each meeting's best-scoring one. */
function mergeCitations(into: MeetingCitation[], citations: MeetingCitation[]): void {
  for (const citation of citations) {
    const existingIdx = into.findIndex((c) => c.meetingId === citation.meetingId);
    if (existingIdx === -1) into.push(citation);
    else if (citation.score > into[existingIdx].score) into[existingIdx] = citation;
  }
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

const isUnsettled = (message: ChatMessage): boolean => message.state === 'loading' || message.state === 'streaming';

/** The one save path, used whenever a message settles. Disk only ever holds settled messages. */
function saveSession(session: ChatSession | undefined): void {
  if (!session) return;
  void useChatStore.getState().persistSession({ ...session, messages: session.messages.filter((m) => !isUnsettled(m)) });
}

/** Earlier replies' follow-up suggestions go once a new question is asked. */
const withoutSuggestions = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => {
    if (!message.suggestions?.length) return message;
    const { suggestions: _, ...rest } = message;
    return rest;
  });

/** What one send carries. */
interface Question {
  text: string;
  attachments: ChatPart[];
  meetings: MeetingListItem[];
}

/** The composer's whole draft, or only `textOverride` (a suggestion, `roci://ask`), which leaves the draft alone. */
function questionToSend(textOverride: string | undefined): Question {
  if (textOverride !== undefined) return { text: textOverride.trim(), attachments: [], meetings: [] };
  const { input, pendingAttachments, selectedMeetingRefs } = useChatStore.getState();
  return { text: input.trim(), attachments: pendingAttachments, meetings: selectedMeetingRefs };
}

/** The question as a message: its text, then its attachments and chosen meetings. */
function questionMessage({ text, attachments, meetings }: Question): ChatMessage {
  const textPart: ChatPart[] = text ? [{ type: 'text', text }] : [];
  return {
    id: Date.now().toString(),
    role: 'user',
    text,
    parts: attachments.length > 0 ? [...textPart, ...attachments] : undefined,
    meetingRefs: meetings.length > 0 ? meetings.map((m) => ({ id: m.id, title: m.title })) : undefined,
    timestamp: Date.now(),
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

/** What the stream gathered beside its text: citations, and when the first word arrived. */
interface StreamTally {
  meetingCitations: MeetingCitation[];
  webCitations: WebCitation[];
  inlineCitations: InlineCitationSpan[];
  firstTextAt: number;
}

/** The conversation with the question carrying its attached meetings, recorded on it (saved when the reply settles) so
 *  every later turn sends them with it. */
function withMeetingContext(reply: Reply, messages: ChatMessage[], meetingContext: string): ChatMessage[] {
  const question = messages.at(-1);
  if (!question) return messages;
  patchMessage(reply.sessionId, question.id, (m) => ({ ...m, meetingContext }));
  return [...messages.slice(0, -1), { ...question, meetingContext }];
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
    patchMessage(reply.sessionId, reply.messageId, (m) => ({ ...m, state: 'streaming' }));
  };

  const webUrls = new Set<string>();

  return orchestrate(
    {
      messages,
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
      onChunk: (chunk, metadata) => {
        if (!isLive(reply)) return;
        if (metadata) {
          for (const citation of metadata.webCitations ?? []) {
            if (webUrls.has(citation.url)) continue;
            webUrls.add(citation.url);
            tally.webCitations.push(citation);
          }
          tally.inlineCitations.push(...(metadata.inlineCitations ?? []));
          useChatStore.setState({ aiActivity: metadata });
        }
        if (!chunk) return;
        markStreaming();
        if (tally.firstTextAt === 0) tally.firstTextAt = Date.now();
        streamingStore.push(chunk);
      },
      onReasoning: (text, generation) => {
        if (!isLive(reply)) return;
        markStreaming();
        streamingStore.pushReasoning(text, generation);
      },
      onToolActivity: (activity) => {
        if (!isLive(reply)) return;
        markStreaming();
        streamingStore.upsertToolCall(activity.toolCallId, toolCallPatch(activity));
        if (activity.phase !== 'end') return;
        mergeCitations(tally.meetingCitations, activity.result.citations ?? []);
        // An image the tool made joins the reply right after the tool's row, and is saved with it.
        if (activity.result.image) streamingStore.addPart(activity.result.image);
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
      if (suggestions.length > 0) saveSession(patchMessage(reply.sessionId, reply.messageId, (m) => ({ ...m, suggestions })));
    })
    .catch((error: unknown) => console.error('[ChatStore] Titles & follow-ups failed:', error));
}

/** Runs one reply to its end: complete, failed, or (via Stop) settled elsewhere. Every outcome is saved once. */
async function generateReply(reply: Reply, request: ReplyRequest): Promise<void> {
  const tally: StreamTally = { meetingCitations: [], webCitations: [], inlineCitations: [], firstTextAt: 0 };
  try {
    const result = await streamReply(reply, request, tally);
    if (!result || !isLive(reply)) return; // Stop settled and saved it.

    logUsage({ category: 'chat', sessionId: reply.sessionId, provider: result.provider, model: result.model, usage: result.tokenUsage })
      .catch((e: unknown) => console.error('[UsageLog] chat:', e));

    const streamed = streamingStore.finish();
    const parts = streamed.parts.filter((p) => p.type !== 'text' || p.text.length > 0);
    const usage = result.tokenUsage;
    saveSession(patchMessage(reply.sessionId, reply.messageId, (m) => ({
      ...m,
      text: streamed.text,
      parts: parts.length > 0 ? parts : undefined,
      state: 'complete',
      tokensPerSecond: tokensPerSecond(usage?.outputTokens, tally.firstTextAt),
      context: result.context,
      usage: result.tokenUsage,
      exchange: result.exchange,
      ...(tally.meetingCitations.length > 0 && { meetingCitations: tally.meetingCitations }),
      ...(tally.webCitations.length > 0 && { webCitations: tally.webCitations }),
      ...(tally.inlineCitations.length > 0 && { inlineCitations: tally.inlineCitations }),
    })));
    endReply(reply);
    notifyReply(reply.sessionId, streamed.text);
    afterReply(reply, request, streamed.text, result.toolset);
  } catch (error: unknown) {
    if (!isLive(reply)) return; // Stopped: the abort surfaced as an error, and Stop already settled it.
    console.error('[ChatStore] Error sending message:', error);
    streamingStore.reset();
    saveSession(patchMessage(reply.sessionId, reply.messageId, (m) => ({
      ...m,
      text: errorMessage(error) || 'Failed to get response',
      isError: true,
      state: 'complete',
    })));
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
  aiActivity: StreamMetadata | null;
  pendingAttachments: ChatPart[];

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

/** One attachment part for a picked file, by its kind. */
function attachmentPart(file: File, base64: string): ChatPart {
  const source = { kind: 'data' as const, base64 };
  if (file.type.startsWith('image/')) return { type: 'image', mimeType: file.type, source, alt: file.name };
  if (file.type.startsWith('audio/')) return { type: 'audio', mimeType: file.type, source };
  if (file.type.startsWith('video/')) return { type: 'video', mimeType: file.type, source, alt: file.name };
  return { type: 'document', mimeType: file.type || 'application/octet-stream', source, fileName: file.name };
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
      const part = attachmentPart(file, await fileToBase64(file));
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
      const part: ChatPart = { type: 'image', mimeType: 'image/png', source: { kind: 'data', base64 }, alt: name };
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
    const answer: ChatMessage = { id: reply.messageId, role: 'model', text: '', timestamp: Date.now() };
    if (!settings || !resolved) {
      const text = locked ? lockedModelGoneReply(locked) : NO_MODEL_REPLY;
      const hinted: ChatSession = { ...session, messages: [...session.messages, { ...answer, text, state: 'complete' }] };
      putSession(hinted);
      saveSession(hinted);
      endReply(reply);
      return;
    }

    // The reply's placeholder lives in memory only; it is saved once it settles.
    putSession({
      ...session,
      messages: [...session.messages, { ...answer, provider: resolved.provider, model: resolved.modelId, state: 'loading' }],
    });
    await generateReply(reply, { session, question, resolved, settings, providers: providers || [], isNewSession });
  },

  stopGeneration: () => {
    const reply = activeReply;
    if (!reply) return;
    reply.controller.abort();
    const streamed = streamingStore.finish();
    saveSession(patchMessage(reply.sessionId, reply.messageId, (m) => ({
      ...m,
      text: streamed.text || m.text || '[Stopped]',
      parts: streamed.parts.length > 0 ? streamed.parts : m.parts,
      state: 'complete',
    })));
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
