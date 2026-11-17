/** Chat Zustand store; the composer ref, abort controller, and injected providers live in module refs. */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { MutableRefObject } from 'react';
import type {
  ChatSession,
  ChatMessage,
  ChatPart,
  ChatIndexEntry,
  AppSettings,
  HistoryItem,
  MeetingCitation,
  WebCitation,
  InlineCitationSpan,
  ReasoningEffort,
} from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { chatService } from '@services/chat.service';
import { unifiedAIService } from '@services/unifiedAIService';
import { resolveChatModel } from '@shared/utils/modelResolver';
import type { StreamMetadata } from '@services/ai/types';
import { capabilitiesOf } from '@services/ai/capabilities';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate } from '@extensions/tool-orchestrator';
import { streamingStore } from './streamingStore';
import type { ToolCallPatch } from './streamingStore';
import type { ToolActivity } from '@extensions/tool-orchestrator/types';
import { buildChatRequest, formatTemporalContext } from '@core/ai';
import { generateSuggestions } from '@services/ai/suggestions';
import { logUsage } from '@extensions/usage';
import { fileToBase64 } from '@shared/utils/file.utils';
import { queryClient } from '@shared/query/queryClient';
import { useAppStore } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { queryKeys } from '@shared/query/queryKeys';
import { CHAT_MAX_ATTACHMENTS, TOOL_RESULT_PREVIEW_CHARS } from '@config/chat.config';
import { UI_CONFIG } from '@config/ui.config';
import { canSendDraft, draftTitle } from '@features/chat/utils';
import { errorMessage } from '@shared/utils/errors';

/** "Reply ready" while Roci is in the background (Settings › Notifications › Chat replies). */
function notifyReply(sessionId: string, text: string): void {
  const max = NOTIFICATIONS_CONFIG.chat.bodyMaxChars;
  const body = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  notifyAppEvent({ id: `chat:${sessionId}`, kind: 'chatReplies', tone: 'success', inFront: 'quiet', title: 'Reply ready', body });
}

/** Query re-reads the chat list from disk (after every chat write). */
function invalidateChats(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.chats() }).catch((error: unknown) =>
    console.error('[ChatStore] Failed to invalidate chats query:', error)
  );
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
  app.setResult(null);
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
  app.setResult(null);
  app.setStatus(AppStatus.IDLE);
  useChatStore.getState().setCurrentSessionId(null);
}

/** Opens a saved chat in the main view (the sidebar's chats, the gallery's "Open chat"). */
export function openChat(sessionId: string): void {
  useChatStore.getState().selectSession(sessionId);
  const app = useAppStore.getState();
  app.setCurrentView('home');
  app.setSelectedHistoryId(null);
  app.setResult(null);
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

/** Injected by useChatRuntime from Settings and History. */
const injectedRefs = {
  settings: null as AppSettings | null,
  providers: null as ModelProvider[] | null,
  historyItems: null as HistoryItem[] | null,
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

// ── Chat list: Query owns it (disk state); every write edits it at once, then disk, then a re-read ──

const entryOf = (session: ChatSession): ChatIndexEntry => ({
  id: session.id,
  title: session.title,
  lastMessageAt: session.lastMessageAt,
  messageCount: session.messages.length,
});

/** The list with `entry` replacing its old row, or added at the top. */
const withEntry = (index: ChatIndexEntry[], entry: ChatIndexEntry): ChatIndexEntry[] =>
  index.some((e) => e.id === entry.id) ? index.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...index];

/** Optimistic chat write: the list changes now, `write` goes to disk; a failure restores the list. Never rejects. */
async function writeChat(edit: (index: ChatIndexEntry[]) => ChatIndexEntry[], write: () => Promise<void>, what: string): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryKeys.chats() });
  const previous = queryClient.getQueryData<ChatIndexEntry[]>(queryKeys.chats());
  queryClient.setQueryData<ChatIndexEntry[]>(queryKeys.chats(), edit(previous ?? []));
  try {
    await write();
  } catch (error: unknown) {
    queryClient.setQueryData(queryKeys.chats(), previous);
    console.error(`[ChatStore] Failed to ${what}:`, error);
  } finally {
    invalidateChats();
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

/** Streams the reply into `streamingStore`; every callback is a no-op once the reply is stopped. */
async function streamReply(reply: Reply, request: ReplyRequest, tally: StreamTally) {
  const { session, question, resolved, settings, providers } = request;
  const historyItems = injectedRefs.historyItems || [];
  const signal = reply.controller.signal;

  const context = await contextPipeline.resolve({
    userMessage: question.text,
    conversationMessages: session.messages,
    historyItems,
    settings,
    providers,
    manualMeetingRefs: question.meetings,
    signal,
  });
  if (!isLive(reply)) return null;

  streamingStore.start(reply.messageId);
  let streaming = false;
  /** The reply's first content (text, thinking or a tool call) switches it from loading to streaming. */
  const markStreaming = () => {
    if (streaming) return;
    streaming = true;
    useChatStore.setState({ aiActivity: null });
    patchMessage(reply.sessionId, reply.messageId, (m) => ({ ...m, state: 'streaming' }));
  };

  const hasToolSupport = capabilitiesOf(resolved.provider, resolved.model).tools;
  const config = buildChatRequest({
    contextBlock: context.text || undefined,
    hasToolAccess: hasToolSupport,
    meetingCount: historyItems.length,
    temporalContext: formatTemporalContext(),
  });
  const webUrls = new Set<string>();

  return orchestrate(
    {
      messages: session.messages,
      systemPrompt: config.systemPrompt,
      settings,
      providers,
      signal,
      webSearchEnabled: useChatStore.getState().webSearchEnabled,
      skipRetrieval: !hasToolSupport,
      reasoningEffort: session.reasoningEffort ?? 'provider-default',
      sessionId: reply.sessionId,
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

/** Title and follow-up suggestions once a reply has finished (best-effort, saved through the same path). */
function afterReply(reply: Reply, request: ReplyRequest, text: string, usage: { provider: string; model: string }): void {
  const { session, question, resolved, settings, providers, isNewSession } = request;
  if (isNewSession) {
    unifiedAIService
      .generateTitle(question.text || session.title, text, settings, providers)
      .then(({ title, usage: titleUsage }) => {
        void useChatStore.getState().renameSession(reply.sessionId, title);
        logUsage({ category: 'title-gen', sessionId: reply.sessionId, ...usage, usage: titleUsage })
          .catch((e: unknown) => console.error('[UsageLog] title-gen:', e));
      })
      .catch((error: unknown) => console.error('[ChatStore] Title generation failed:', error));
  }
  generateSuggestions({ resolved, userMessage: question.text, responsePreview: text, sessionId: reply.sessionId })
    .then((suggestions) => {
      if (suggestions.length === 0) return;
      saveSession(patchMessage(reply.sessionId, reply.messageId, (m) => ({ ...m, suggestions })));
    })
    .catch((error: unknown) => console.error('[ChatStore] Suggestions failed:', error));
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
      tokenCount: usage?.outputTokens,
      inputTokenCount: usage?.inputTokens,
      cacheReadTokens: usage?.cacheReadTokens,
      cacheWriteTokens: usage?.cacheWriteTokens,
      tokensPerSecond: tokensPerSecond(usage?.outputTokens, tally.firstTextAt),
      ...(tally.meetingCitations.length > 0 && { meetingCitations: tally.meetingCitations }),
      ...(tally.webCitations.length > 0 && { webCitations: tally.webCitations }),
      ...(tally.inlineCitations.length > 0 && { inlineCitations: tally.inlineCitations }),
    })));
    endReply(reply);
    notifyReply(reply.sessionId, streamed.text);
    afterReply(reply, request, streamed.text, { provider: result.provider, model: result.model });
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
  webSearchEnabled: boolean;
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
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  /** Stops the reply in flight, wherever it is, keeping what it has written so far. */
  stopGeneration: () => void;
  copyMessage: (messageId: string, text: string) => void;
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  toggleWebSearch: () => void;
  /** Sets the current chat's thinking level (saved with the chat), or the new chat's before it exists. */
  setReasoningEffort: (effort: ReasoningEffort) => void;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  addScreenshotAttachment: (base64: string, name: string) => void;
  /** A fresh, unsaved chat about `meeting`, with the meeting attached as context. */
  startMeetingChat: (meeting: MeetingListItem) => void;
  /** Writes a session to disk and its row to the chat list; never rejects. */
  persistSession: (session: ChatSession) => Promise<void>;
  /** Replaces the loaded sessions (useChatRuntime hydration). */
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
  webSearchEnabled: false,
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
    await writeChat((index) => index.filter((e) => e.id !== sessionId), () => chatService.deleteSession(sessionId), 'delete chat');
  },

  renameSession: async (sessionId, newTitle) => {
    // Memory first, so a save landing during the rename writes the new title too.
    const existing = sessionOf(sessionId);
    if (existing) putSession({ ...existing, title: newTitle });
    await writeChat(
      (index) => index.map((e) => (e.id === sessionId ? { ...e, title: newTitle } : e)),
      () => chatService.renameSession(sessionId, newTitle),
      'rename chat'
    );
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

  toggleWebSearch: () => set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),

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

  persistSession: (session) =>
    writeChat((index) => withEntry(index, entryOf(session)), () => chatService.persistSession(session), 'save chat'),

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
    const resolved = settings ? resolveChatModel(settings, providers || []) : null;
    const answer: ChatMessage = { id: reply.messageId, role: 'model', text: '', timestamp: Date.now() };
    if (!settings || !resolved) {
      const hinted: ChatSession = { ...session, messages: [...session.messages, { ...answer, text: NO_MODEL_REPLY, state: 'complete' }] };
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
  historyItems: HistoryItem[] | null;
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

/** The open chat, or null before one is chosen or while it loads. */
export const useCurrentSession = (): ChatSession | null =>
  useChatStore(useShallow((s) => (s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) ?? null : null)));
