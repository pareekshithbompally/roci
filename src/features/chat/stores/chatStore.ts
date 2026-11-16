/** Chat Zustand store; sessions, composer ref, abort controller, and injected providers live in module refs. */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
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
import {
  CHAT_PAGE_SIZE,
  TOOL_RESULT_PREVIEW_CHARS,
} from '@config/chat.config';

/** "Reply ready" while Kasset is in the background (Settings › Notifications › Chat replies). */
function notifyReply(sessionId: string, text: string): void {
  const max = NOTIFICATIONS_CONFIG.chat.bodyMaxChars;
  const body = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  notifyAppEvent({ id: `chat:${sessionId}`, kind: 'chatReplies', tone: 'success', inFront: 'quiet', title: 'Reply ready', body });
}

/** Reconcile the mirrored session index with disk truth. */
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

/** Session objects — accessed synchronously in actions, no stale closure */
let loadedSessionsCache = new Map<string, ChatSession>();

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

/** Send a question in a fresh chat on home (the home composer, `kasset://ask`). */
export function askInNewChat(text: string): void {
  startNewChat();
  useChatStore.getState().newChat();
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

/** ChatInput registers its textarea on mount (null on unmount). */
export function registerChatComposer(textarea: HTMLTextAreaElement | null): void {
  chatInputRef.current = textarea;
  if (!textarea || !composerFocusPending) return;
  composerFocusPending = false;
  textarea.focus();
}

/** Current AbortController for generation */
let abortControllerRef: AbortController | null = null;

/** Injected from SettingsContext and HistoryContext via useChatStoreInit() */
const injectedRefs = {
  settings: null as AppSettings | null,
  providers: null as ModelProvider[] | null,
  historyItems: null as HistoryItem[] | null,
};

// ── Types ──

export interface ChatStoreState {
  sessionIndex: ChatIndexEntry[];
  loadedSessions: Map<string, ChatSession>;
  currentSessionId: string | null;
  isInitialized: boolean;
  isSessionLoading: boolean;
  indexPage: number;
  input: string;
  isLoading: boolean;
  viewHistory: boolean;
  searchQuery: string;
  debouncedSearchQuery: string;
  copiedMessageId: string | null;
  selectedMeetingRefs: MeetingListItem[];
  /** The meeting a not-yet-sent chat belongs to (meeting chat); the first message saves the chat linked to it. */
  draftMeetingId: string | null;
  webSearchEnabled: boolean;
  /** The thinking level picked before a new chat exists; the chat keeps it once created. */
  draftReasoningEffort: ReasoningEffort;
  aiActivity: StreamMetadata | null;
  pendingAttachments: ChatPart[];

  loadSessions: () => Promise<void>;
  setInput: (input: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setViewHistory: (view: boolean) => void;
  setSearchQuery: (query: string) => void;
  setDebouncedSearchQuery: (query: string) => void;
  setSessionIndex: (index: ChatIndexEntry[]) => void;
  setIsInitialized: (v: boolean) => void;
  newChat: () => void;
  sendMessage: (
    textOverride?: string,
    options?: { regenerate?: boolean }
  ) => Promise<void>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  stopGeneration: () => void;
  copyMessage: (messageId: string, text: string) => void;
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  toggleWebSearch: () => void;
  /** Sets the current chat's thinking level (saved with the chat), or the new chat's before it exists. */
  setReasoningEffort: (effort: ReasoningEffort) => void;
  rerunLastMessage: () => Promise<void>;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  addScreenshotAttachment: (base64: string, name: string) => void;
  /** A fresh, unsaved chat about `meeting`, with the meeting attached as context. */
  startMeetingChat: (meeting: MeetingListItem) => void;
  loadMoreSessions: () => void;
  /** Persist a session to disk and update store atomically */
  persistSession: (session: ChatSession) => Promise<void>;
  /** Set the current loaded sessions Map (for effects / hydration) */
  setLoadedSessions: (updater: (prev: Map<string, ChatSession>) => Map<string, ChatSession>) => void;
  setIsSessionLoading: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setAiActivity: (v: ChatStoreState['aiActivity']) => void;
  setCopiedMessageId: (id: string | null) => void;
  /** For LRU eviction check in effects */
  getLoadedSessionsSize: () => number;
}

// ── Store ──

const MAX_ATTACHMENTS = 10;

export const useChatStore = create<ChatStoreState>((set, get) => ({
  // ── State ──

  sessionIndex: [],
  loadedSessions: new Map(),
  currentSessionId: null,
  isInitialized: false,
  isSessionLoading: false,
  indexPage: 1,
  input: '',
  isLoading: false,
  viewHistory: false,
  searchQuery: '',
  debouncedSearchQuery: '',
  copiedMessageId: null,
  selectedMeetingRefs: [],
  draftMeetingId: null,
  webSearchEnabled: false,
  draftReasoningEffort: 'provider-default',
  aiActivity: null,
  pendingAttachments: [],

  // ── Session management ──

  loadSessions: async () => {
    // ChatProvider's chats query owns the fetch; just ask it to refetch.
    await queryClient.invalidateQueries({ queryKey: queryKeys.chats() });
  },

  setInput: (input) => set({ input }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setViewHistory: (viewHistory) => set({ viewHistory }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setDebouncedSearchQuery: (debouncedSearchQuery) => set({ debouncedSearchQuery }),

  setSessionIndex: (sessionIndex) => set({ sessionIndex }),

  setIsInitialized: (isInitialized) => set({ isInitialized }),

  setIsSessionLoading: (isSessionLoading) => set({ isSessionLoading }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setAiActivity: (aiActivity) => set({ aiActivity }),

  setCopiedMessageId: (copiedMessageId) => set({ copiedMessageId }),

  getLoadedSessionsSize: () => get().loadedSessions.size,

  setLoadedSessions: (updater) => {
    set((state) => {
      const next = updater(state.loadedSessions);
      loadedSessionsCache = next;
      return { loadedSessions: next };
    });
  },

  newChat: () =>
    set({
      draftMeetingId: null,
      currentSessionId: null,
      draftReasoningEffort: 'provider-default',
      input: '',
      viewHistory: false,
      searchQuery: '',
    }),

  selectSession: (sessionId) => {
    const { loadedSessions } = get();
    set({
      currentSessionId: sessionId,
      viewHistory: false,
      isSessionLoading: !loadedSessions.has(sessionId),
    });
  },

  deleteSession: async (sessionId) => {
    try {
      await chatService.deleteSession(sessionId);
      set((state) => ({
        loadedSessions: (() => {
          const next = new Map(state.loadedSessions);
          next.delete(sessionId);
          loadedSessionsCache = next;
          return next;
        })(),
        sessionIndex: state.sessionIndex.filter((e) => e.id !== sessionId),
        currentSessionId:
          state.currentSessionId === sessionId ? null : state.currentSessionId,
      }));
      invalidateChats();
    } catch (error) {
      console.error('[ChatStore] Error deleting session:', error);
    }
  },

  renameSession: async (sessionId, newTitle) => {
    try {
      await chatService.renameSession(sessionId, newTitle);
      set((state) => ({
        loadedSessions: (() => {
          const existing = state.loadedSessions.get(sessionId);
          if (!existing) return state.loadedSessions;
          const next = new Map(state.loadedSessions);
          next.set(sessionId, { ...existing, title: newTitle });
          loadedSessionsCache = next;
          return next;
        })(),
        sessionIndex: state.sessionIndex.map((e) =>
          e.id === sessionId ? { ...e, title: newTitle } : e
        ),
      }));
      invalidateChats();
    } catch (error) {
      console.error('[ChatStore] Error renaming session:', error);
    }
  },

  copyMessage: (messageId, text) => {
    navigator.clipboard.writeText(text).catch((error: unknown) =>
      console.error('[ChatStore] Failed to copy message:', error)
    );
    set({ copiedMessageId: messageId });
    setTimeout(() => {
      set({ copiedMessageId: null });
    }, 2000);
  },

  setSelectedMeetingRefs: (selectedMeetingRefs) => set({ selectedMeetingRefs }),

  toggleWebSearch: () => set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),

  setReasoningEffort: (effort) => {
    const { currentSessionId, persistSession, setLoadedSessions } = get();
    const session = currentSessionId ? loadedSessionsCache.get(currentSessionId) : undefined;
    if (!session) {
      set({ draftReasoningEffort: effort });
      return;
    }
    // In memory at once, so the very next message uses it; then saved.
    const updated = { ...session, reasoningEffort: effort };
    setLoadedSessions((prev) => new Map(prev).set(updated.id, updated));
    persistSession(updated).catch((error: unknown) =>
      console.error('[ChatStore] Failed to save thinking level:', error)
    );
  },


  loadMoreSessions: () => set((state) => ({ indexPage: state.indexPage + 1 })),

  // ── Persist ──

  persistSession: async (session) => {
    await chatService.persistSession(session);
    set((state) => ({
      loadedSessions: (() => {
        const next = new Map(state.loadedSessions);
        next.set(session.id, session);
        loadedSessionsCache = next;
        return next;
      })(),
      sessionIndex: state.sessionIndex.map((e) =>
        e.id === session.id
          ? {
              ...e,
              title: session.title,
              lastMessageAt: session.lastMessageAt,
              messageCount: session.messages.length,
            }
          : e
      ),
    }));
  },

  // ── Attachments ──

  addAttachment: async (file) => {
    const { pendingAttachments } = get();
    if (pendingAttachments.length >= MAX_ATTACHMENTS) return;

    try {
      const base64 = await fileToBase64(file);
      const source = { kind: 'data' as const, base64 };

      let part: ChatPart;
      if (file.type.startsWith('image/')) {
        part = { type: 'image', mimeType: file.type, source, alt: file.name };
      } else if (file.type.startsWith('audio/')) {
        part = { type: 'audio', mimeType: file.type, source };
      } else if (file.type.startsWith('video/')) {
        part = { type: 'video', mimeType: file.type, source, alt: file.name };
      } else {
        part = {
          type: 'document',
          mimeType: file.type || 'application/octet-stream',
          source,
          fileName: file.name,
        };
      }

      set({ pendingAttachments: [...pendingAttachments, part] });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[ChatStore] Failed to add attachment:', err.message);
    }
  },

  removeAttachment: (index) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index),
    })),

  clearAttachments: () => set({ pendingAttachments: [] }),

  addScreenshotAttachment: (base64, name) =>
    set((state) => {
      if (state.pendingAttachments.length >= MAX_ATTACHMENTS) return state;
      const part: ChatPart = {
        type: 'image',
        mimeType: 'image/png',
        source: { kind: 'data', base64 },
        alt: name,
      };
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
      viewHistory: false,
    }),

  // ── Send Message ──

  sendMessage: async (textOverride, options = {}) => {
    const { input, isLoading, currentSessionId, selectedMeetingRefs, webSearchEnabled, pendingAttachments, draftMeetingId } = get();
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const isRegenerate = options.regenerate === true;
    const isNewSession = !currentSessionId;
    const activeSessionId = currentSessionId || Date.now().toString();

    let targetSession: ChatSession;

    if (isNewSession) {
      const { draftReasoningEffort } = get();
      targetSession = {
        id: activeSessionId,
        title: textToSend.slice(0, 30),
        lastMessageAt: Date.now(),
        messages: [],
        ...(draftMeetingId && { meetingId: draftMeetingId }),
        ...(draftReasoningEffort !== 'provider-default' && { reasoningEffort: draftReasoningEffort }),
      };
      const next = new Map(get().loadedSessions);
      next.set(activeSessionId, targetSession);
      loadedSessionsCache = next;
      set({
        sessionIndex: [
          { id: activeSessionId, title: targetSession.title, lastMessageAt: Date.now() },
          ...get().sessionIndex,
        ],
        currentSessionId: activeSessionId,
        draftReasoningEffort: 'provider-default',
        draftMeetingId: null,
        input: isRegenerate ? get().input : '',
        isLoading: true,
        selectedMeetingRefs: [],
        pendingAttachments: isRegenerate ? get().pendingAttachments : [],
        loadedSessions: next,
      });
    } else {
      const cached = loadedSessionsCache.get(activeSessionId);
      if (!cached) {
        console.error('[ChatStore] sendMessage: session not in cache', activeSessionId);
        set({ isLoading: false });
        return;
      }
      targetSession = { ...cached };
      set({
        input: isRegenerate ? get().input : '',
        isLoading: true,
        selectedMeetingRefs: [],
        pendingAttachments: isRegenerate ? get().pendingAttachments : [],
      });
    }

    // Clear suggestions from previous messages
    targetSession.messages = targetSession.messages.map((msg) => {
      if (msg.suggestions && msg.suggestions.length > 0) {
        const { suggestions: _, ...rest } = msg;
        return rest as ChatMessage;
      }
      return msg;
    });

    const selectedRefs = selectedMeetingRefs;

    if (isRegenerate) {
      const lastIdx = targetSession.messages.length - 1;
      if (lastIdx >= 0 && targetSession.messages[lastIdx]?.role === 'model') {
        targetSession.messages = targetSession.messages.slice(0, lastIdx);
      }
    } else {
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: textToSend,
        parts:
          pendingAttachments.length > 0
            ? [{ type: 'text' as const, text: textToSend }, ...pendingAttachments]
            : undefined,
        meetingRefs:
          selectedRefs.length > 0
            ? selectedRefs.map((m) => ({ id: m.id, title: m.title }))
            : undefined,
        timestamp: Date.now(),
      };
      targetSession.messages.push(userMsg);
    }

    targetSession.lastMessageAt = Date.now();

    // Update cache + store
    const nextMap = new Map(get().loadedSessions);
    nextMap.set(activeSessionId, targetSession);
    loadedSessionsCache = nextMap;
    set({ loadedSessions: nextMap });

    // Create abort controller
    abortControllerRef = new AbortController();

    // Persist user message immediately
    await chatService.persistSession(targetSession);
    set((state) => ({
      sessionIndex: state.sessionIndex.map((e) =>
        e.id === activeSessionId
          ? {
              ...e,
              title: targetSession.title,
              lastMessageAt: targetSession.lastMessageAt,
              messageCount: targetSession.messages.length,
            }
          : e
      ),
    }));

    // Resolve model
    const { settings, providers } = injectedRefs;
    const effectiveProviders = providers || [];
    const resolved = settings
      ? resolveChatModel(settings, effectiveProviders)
      : null;

    // Guard: no model selected
    if (!resolved) {
      const noModelMsgId = (Date.now() + 1).toString();
      const cacheSession = loadedSessionsCache.get(activeSessionId);
      if (cacheSession) {
        const updatedSession: ChatSession = {
          ...cacheSession,
          messages: [
            ...cacheSession.messages,
            {
              id: noModelMsgId,
              role: 'model' as const,
              text: 'Please select a model from the picker in the toolbar before sending a message.',
              timestamp: Date.now(),
              state: 'complete' as const,
            },
          ],
          lastMessageAt: Date.now(),
        };
        loadedSessionsCache.set(activeSessionId, updatedSession);
        const next = new Map(get().loadedSessions);
        next.set(activeSessionId, updatedSession);
        set({ loadedSessions: next, isLoading: false });
      } else {
        set({ isLoading: false });
      }
      return;
    }

    // Create assistant message placeholder
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      provider: resolved.provider,
      model: resolved.modelId,
      state: 'loading',
    };

    let sessionForStore = loadedSessionsCache.get(activeSessionId) || targetSession;
    sessionForStore = {
      ...sessionForStore,
      messages: [...sessionForStore.messages, assistantMsg],
      lastMessageAt: Date.now(),
    };
    loadedSessionsCache.set(activeSessionId, sessionForStore);
    const nextStore = new Map(get().loadedSessions);
    nextStore.set(activeSessionId, sessionForStore);
    set({ loadedSessions: nextStore });

    // Effective settings for the AI call
    const effectiveSettings = settings || {
      transcriptionModel: '',
      chatModel: '',
      apiKey: '',
    };

    try {
      const pipelineResult = await contextPipeline.resolve({
        userMessage: textToSend,
        conversationMessages: targetSession.messages,
        historyItems: injectedRefs.historyItems || [],
        settings: effectiveSettings,
        providers: effectiveProviders,
        manualMeetingRefs: selectedRefs,
        signal: abortControllerRef?.signal,
      });
      const contextBlock = pipelineResult.text;

      streamingStore.start(assistantMsgId);
      let hasStartedStreaming = false;
      let streamStartTime = 0;

      const hasToolSupport = capabilitiesOf(resolved.provider, resolved.model).tools;

      const config = buildChatRequest({
        contextBlock: contextBlock || undefined,
        hasToolAccess: hasToolSupport,
        meetingCount: (injectedRefs.historyItems || []).length,
        temporalContext: formatTemporalContext(),
      });

      const allCitations: MeetingCitation[] = [];
      const allWebCitations: WebCitation[] = [];
      const webCitationUrls = new Set<string>();
      const allInlineCitations: InlineCitationSpan[] = [];

      /** The reply's first content (text, thinking or a tool call) switches it from loading to streaming. */
      const markStreaming = () => {
        if (hasStartedStreaming) return;
        hasStartedStreaming = true;
        set({ aiActivity: null });
        const cacheS = loadedSessionsCache.get(activeSessionId);
        if (!cacheS) return;
        const updated = {
          ...cacheS,
          messages: cacheS.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, state: 'streaming' as const } : m
          ),
        };
        loadedSessionsCache.set(activeSessionId, updated);
        const nm = new Map(get().loadedSessions);
        nm.set(activeSessionId, updated);
        set({ loadedSessions: nm });
      };

      const handleChunk = (
        chunk: string,
        metadata?: StreamMetadata
      ) => {
        if (metadata) {
          if (metadata.webCitations) {
            for (const citation of metadata.webCitations) {
              if (!webCitationUrls.has(citation.url)) {
                webCitationUrls.add(citation.url);
                allWebCitations.push(citation);
              }
            }
          }
          if (metadata.inlineCitations) {
            allInlineCitations.push(...metadata.inlineCitations);
          }
          set({ aiActivity: metadata });
        }

        if (chunk) {
          markStreaming();
          if (streamStartTime === 0) streamStartTime = Date.now();
          streamingStore.push(chunk);
        }
      };

      const orchestrateResult = await orchestrate(
        {
          messages: targetSession.messages.filter(
            (m) => m.state !== 'loading' && m.state !== 'streaming'
          ),
          systemPrompt: config.systemPrompt,
          settings: effectiveSettings,
          providers: effectiveProviders,
          historyItems: injectedRefs.historyItems || [],
          signal: abortControllerRef?.signal,
          webSearchEnabled,
          skipRetrieval: !hasToolSupport,
          reasoningEffort: targetSession.reasoningEffort ?? 'provider-default',
        },
        {
          onChunk: handleChunk,
          onReasoning: (text, generation) => {
            markStreaming();
            streamingStore.pushReasoning(text, generation);
          },
          onToolActivity: (activity) => {
            markStreaming();
            streamingStore.upsertToolCall(activity.toolCallId, toolCallPatch(activity));
            if (activity.phase === 'end') mergeCitations(allCitations, activity.result.citations ?? []);
          },
        }
      );

      logUsage({
        category: 'chat',
        sessionId: activeSessionId,
        provider: orchestrateResult.provider,
        model: orchestrateResult.model,
        usage: orchestrateResult.tokenUsage,
      }).catch((e) => console.error('[UsageLog] chat:', e));

      // Stream complete — flush store and commit final state
      const streamResult = streamingStore.finish();
      const mainText = streamResult.text;
      const finalParts: ChatPart[] = streamResult.parts.filter(
        (p) => p.type !== 'text' || (p as Extract<ChatPart, { type: 'text' }>).text.length > 0
      );

      const tokenCount = orchestrateResult.tokenUsage?.outputTokens;
      const inputTokenCount = orchestrateResult.tokenUsage?.inputTokens;
      const cacheReadTokens = orchestrateResult.tokenUsage?.cacheReadTokens;
      const cacheWriteTokens = orchestrateResult.tokenUsage?.cacheWriteTokens;
      const streamDurationSec =
        streamStartTime > 0 ? (Date.now() - streamStartTime) / 1000 : 0;
      const tokensPerSecond =
        tokenCount && streamDurationSec > 0.05
          ? Math.round(tokenCount / streamDurationSec)
          : undefined;

      const existingSession = loadedSessionsCache.get(activeSessionId);
      if (existingSession) {
        const finalSession: ChatSession = {
          ...existingSession,
          messages: existingSession.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: mainText,
                  parts: finalParts.length > 0 ? finalParts : undefined,
                  state: 'complete' as const,
                  tokenCount,
                  inputTokenCount,
                  cacheReadTokens,
                  cacheWriteTokens,
                  tokensPerSecond,
                  ...(allCitations.length > 0 && { meetingCitations: allCitations }),
                  ...(allWebCitations.length > 0 && { webCitations: allWebCitations }),
                  ...(allInlineCitations.length > 0 && { inlineCitations: allInlineCitations }),
                }
              : m
          ),
          lastMessageAt: Date.now(),
        };
        loadedSessionsCache.set(activeSessionId, finalSession);
        const nm = new Map(get().loadedSessions);
        nm.set(activeSessionId, finalSession);
        set({ loadedSessions: nm });
        get()
          .persistSession(finalSession)
          .catch((error: unknown) =>
            console.error('[ChatStore] Failed to persist final session:', error)
          );
      }

      set({ isLoading: false, aiActivity: null });
      notifyReply(activeSessionId, mainText);

      // Title generation for new sessions (best-effort)
      if (isNewSession) {
        unifiedAIService
          .generateTitle(textToSend, mainText, effectiveSettings, effectiveProviders)
          .then(({ title: genTitle, usage: titleUsage }) => {
            get().renameSession(activeSessionId, genTitle);
            logUsage({
              category: 'title-gen',
              sessionId: activeSessionId,
              provider: orchestrateResult.provider,
              model: orchestrateResult.model,
              usage: titleUsage,
            }).catch((e) => console.error('[UsageLog] title-gen:', e));
          })
          .catch(() => {
            /* best-effort */
          });
      }

      // Generate suggestions async (best-effort)
      if (resolved) {
        generateSuggestions({
          resolved,
          userMessage: textToSend,
          responsePreview: mainText.slice(0, 500),
          signal: abortControllerRef?.signal,
          sessionId: activeSessionId,
        })
          .then((suggestions) => {
            if (suggestions.length > 0) {
              const sessionForSuggestions = loadedSessionsCache.get(activeSessionId);
              if (sessionForSuggestions) {
                const updatedSession = {
                  ...sessionForSuggestions,
                  messages: sessionForSuggestions.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, suggestions } : m
                  ),
                };
                loadedSessionsCache.set(activeSessionId, updatedSession);
                const nm = new Map(get().loadedSessions);
                nm.set(activeSessionId, updatedSession);
                set({ loadedSessions: nm });
                get()
                  .persistSession(updatedSession)
                  .catch((error: unknown) =>
                    console.error('[ChatStore] Failed to persist suggested session:', error)
                  );
              }
            }
          })
          .catch(() => {
            /* suggestions are best-effort */
          });
      }
    } catch (error: unknown) {
      console.error('[ChatStore] Error sending message:', error);
      streamingStore.reset();

      const err = error as Error & { name?: string; message?: string };

      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        const abortedSession = loadedSessionsCache.get(activeSessionId);
        if (abortedSession) {
          const updated = {
            ...abortedSession,
            messages: abortedSession.messages.map((m) => {
              if (m.id !== assistantMsgId || m.state === 'complete') return m;
              return {
                ...m,
                text: m.text || '[Stopped]',
                state: 'complete' as const,
              };
            }),
          };
          loadedSessionsCache.set(activeSessionId, updated);
          const nm = new Map(get().loadedSessions);
          nm.set(activeSessionId, updated);
          set({ loadedSessions: nm, isLoading: false, aiActivity: null });
        } else {
          set({ isLoading: false, aiActivity: null });
        }
        return;
      }

      const errorSession = loadedSessionsCache.get(activeSessionId);
      if (errorSession) {
        const failedSession: ChatSession = {
          ...errorSession,
          messages: errorSession.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: err.message || 'Failed to get response',
                  isError: true,
                  state: 'complete' as const,
                }
              : m
          ),
          lastMessageAt: Date.now(),
        };
        loadedSessionsCache.set(activeSessionId, failedSession);
        const nm = new Map(get().loadedSessions);
        nm.set(activeSessionId, failedSession);
        set({ loadedSessions: nm });
        get()
          .persistSession(failedSession)
          .catch((error: unknown) =>
            console.error('[ChatStore] Failed to persist failed session:', error)
          );
      }
      set({ isLoading: false });
    } finally {
      abortControllerRef = null;
    }
  },

  stopGeneration: () => {
    if (abortControllerRef) {
      abortControllerRef.abort();
      abortControllerRef = null;

      const streamResult = streamingStore.finish();
      const { currentSessionId, loadedSessions } = get();

      if (!currentSessionId) {
        set({ isLoading: false, aiActivity: null });
        return;
      }

      const existingSession = loadedSessions.get(currentSessionId);
      if (!existingSession) {
        set({ isLoading: false, aiActivity: null });
        return;
      }

      const stoppedSession: ChatSession = {
        ...existingSession,
        messages: existingSession.messages.map((m) => {
          if (m.state !== 'loading' && m.state !== 'streaming') return m;
          const text = streamResult.text || m.text || '[Stopped]';
          const parts = streamResult.parts.length > 0 ? streamResult.parts : m.parts;
          return { ...m, text, parts, state: 'complete' as const };
        }),
      };

      loadedSessionsCache.set(currentSessionId, stoppedSession);
      const next = new Map(loadedSessions);
      next.set(currentSessionId, stoppedSession);
      set({ loadedSessions: next, isLoading: false, aiActivity: null });
    }
  },

  rerunLastMessage: async () => {
    const { currentSessionId, loadedSessions } = get();
    const session = currentSessionId ? loadedSessions.get(currentSessionId) : null;
    if (!session || session.messages.length < 2) return;

    const messages = session.messages;
    const lastIdx = messages.length - 1;
    if (messages[lastIdx]?.role !== 'model') return;

    const lastUserMsg = messages[lastIdx - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    await get().sendMessage(lastUserMsg.text, { regenerate: true });
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

export const useChatSessionIndex = () => useChatStore((s) => s.sessionIndex);
export const useChatCurrentSessionId = () => useChatStore((s) => s.currentSessionId);
export const useChatInitialized = () => useChatStore((s) => s.isInitialized);
export const useChatSessionLoading = () => useChatStore((s) => s.isSessionLoading);
export const useChatInput = () => useChatStore((s) => s.input);
export const useChatIsLoading = () => useChatStore((s) => s.isLoading);
export const useChatViewHistory = () => useChatStore((s) => s.viewHistory);
export const useChatSearchQuery = () => useChatStore((s) => s.searchQuery);
export const useChatDebouncedSearchQuery = () => useChatStore((s) => s.debouncedSearchQuery);
export const useChatCopiedMessageId = () => useChatStore((s) => s.copiedMessageId);
export const useChatSelectedMeetingRefs = () => useChatStore((s) => s.selectedMeetingRefs);
export const useChatWebSearchEnabled = () => useChatStore((s) => s.webSearchEnabled);
/** The current chat's thinking level, or the level picked for the chat about to start. */
export const useChatReasoningEffort = () =>
  useChatStore((s) => {
    const session = s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined;
    return session ? session.reasoningEffort ?? 'provider-default' : s.draftReasoningEffort;
  });
export const useChatAiActivity = () => useChatStore((s) => s.aiActivity);
export const useChatPendingAttachments = () => useChatStore((s) => s.pendingAttachments);

/** Derived: current session from cache */
export const useCurrentSession = (): ChatSession | null =>
  useChatStore(
    useShallow((s) =>
      s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) ?? null : null
    )
  );

/** Derived: filtered + paginated index entries — shallow-compared to prevent renders on unrelated state changes */
export const useFilteredIndexEntries = (): ChatIndexEntry[] => {
  const sessionIndex = useChatStore((s) => s.sessionIndex);
  const debouncedSearchQuery = useChatStore((s) => s.debouncedSearchQuery);
  const indexPage = useChatStore((s) => s.indexPage);

  return useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase();
    if (!q) return sessionIndex.slice(0, indexPage * CHAT_PAGE_SIZE);
    return sessionIndex.filter((e) => e.title.toLowerCase().includes(q));
  }, [sessionIndex, debouncedSearchQuery, indexPage]);
};

// ── Stable Action Hook ──

export const useChatActions = () => {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setInput = useChatStore((s) => s.setInput);
  const setCurrentSessionId = useChatStore((s) => s.setCurrentSessionId);
  const setViewHistory = useChatStore((s) => s.setViewHistory);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const newChat = useChatStore((s) => s.newChat);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const selectSession = useChatStore((s) => s.selectSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const copyMessage = useChatStore((s) => s.copyMessage);
  const setSelectedMeetingRefs = useChatStore((s) => s.setSelectedMeetingRefs);
  const toggleWebSearch = useChatStore((s) => s.toggleWebSearch);
  const rerunLastMessage = useChatStore((s) => s.rerunLastMessage);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const clearAttachments = useChatStore((s) => s.clearAttachments);
  const addScreenshotAttachment = useChatStore((s) => s.addScreenshotAttachment);
  const loadMoreSessions = useChatStore((s) => s.loadMoreSessions);

  return {
    sendMessage,
    setInput,
    setCurrentSessionId,
    setViewHistory,
    setSearchQuery,
    newChat,
    loadSessions,
    selectSession,
    deleteSession,
    renameSession,
    stopGeneration,
    copyMessage,
    setSelectedMeetingRefs,
    toggleWebSearch,
    rerunLastMessage,
    addAttachment,
    removeAttachment,
    clearAttachments,
    addScreenshotAttachment,
    loadMoreSessions,
  };
};
