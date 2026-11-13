/**
 * Chat Store
 *
 * Zustand store replacing the monolithic ChatContext. Follows the same
 * selector + action hook pattern as appStore.ts.
 *
 * Module-level refs for:
 *  - loadedSessions (Map) — session objects, accessed synchronously in callbacks
 *  - chatInputRef — HTMLTextAreaElement ref for Cmd+L focus
 *  - abortRef — current AbortController
 *  - injectedRefs — settings/providers/historyItems from external providers
 */

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
} from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { chatService } from '@services/chat.service';
import { unifiedAIService } from '@services/unifiedAIService';
import { resolveModel, supportsTools } from '@shared/utils/modelResolver';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate } from '@extensions/tool-orchestrator';
import { streamingStore } from './streamingStore';
import { buildChatRequest, formatTemporalContext } from '@core/ai';
import { generateSuggestions } from '@services/ai/suggestions';
import { logUsage } from '@extensions/usage';
import { fileToBase64 } from '@shared/utils/file.utils';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import {
  CHAT_PAGE_SIZE,
} from '@config/chat.config';

/** Reconcile the mirrored session index with disk truth. */
function invalidateChats(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.chats() }).catch((error: unknown) =>
    console.error('[ChatStore] Failed to invalidate chats query:', error)
  );
}

// ── Module-level refs ──

/** Session objects — accessed synchronously in actions, no stale closure */
let loadedSessionsCache = new Map<string, ChatSession>();

/** HTMLTextAreaElement ref exposed for Cmd+L focus */
export const chatInputRef: MutableRefObject<HTMLTextAreaElement | null> = { current: null };

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
  webSearchEnabled: boolean;
  aiActivity: {
    isThinking?: boolean;
    isSearching?: boolean;
    searchQuery?: string;
    thinkingContent?: string;
  } | null;
  deleteConfirmId: string | null;
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
  setDeleteConfirmId: (id: string | null) => void;
  rerunLastMessage: () => Promise<void>;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  addScreenshotAttachment: (base64: string, name: string) => void;
  getOrCreateMeetingSession: (meetingId: string, meetingTitle: string) => void;
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
  webSearchEnabled: false,
  aiActivity: null,
  deleteConfirmId: null,
  pendingAttachments: [],

  // ── Session management ──

  loadSessions: async () => {
    // Single owner: ChatProvider's chats query fetches and mirrors into the
    // store. Here we only ask it to refetch (deduped by Query).
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
      currentSessionId: null,
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

  setDeleteConfirmId: (deleteConfirmId) => set({ deleteConfirmId }),

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

  getOrCreateMeetingSession: (meetingId, meetingTitle) => {
    const { loadedSessions } = get();
    for (const [, session] of loadedSessions) {
      if (session.meetingId === meetingId) {
        set({ currentSessionId: session.id, viewHistory: false });
        return;
      }
    }

    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: `Chat: ${meetingTitle}`,
      lastMessageAt: Date.now(),
      messages: [],
      meetingId,
    };

    const next = new Map(loadedSessions);
    next.set(newSession.id, newSession);
    loadedSessionsCache = next;

    set((state) => ({
      loadedSessions: next,
      sessionIndex: [
        {
          id: newSession.id,
          title: newSession.title,
          lastMessageAt: newSession.lastMessageAt,
        },
        ...state.sessionIndex,
      ],
      currentSessionId: newSession.id,
      viewHistory: false,
    }));

    // Persist the new session (was previously memory-only and lost on
    // reload) and reconcile the index query.
    get()
      .persistSession(newSession)
      .catch((error: unknown) =>
        console.error('[ChatStore] Failed to persist meeting session:', error)
      );
    invalidateChats();
  },

  // ── Send Message ──

  sendMessage: async (textOverride, options = {}) => {
    const { input, isLoading, currentSessionId, selectedMeetingRefs, webSearchEnabled, pendingAttachments } = get();
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const isRegenerate = options.regenerate === true;
    const isNewSession = !currentSessionId;
    const activeSessionId = currentSessionId || Date.now().toString();

    let targetSession: ChatSession;

    if (isNewSession) {
      targetSession = {
        id: activeSessionId,
        title: textToSend.slice(0, 30),
        lastMessageAt: Date.now(),
        messages: [],
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
      ? resolveModel(settings.chatModel, effectiveProviders)
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
      audioQualityPreset: 'voice' as const,
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
      const mentionedMeetingIds = pipelineResult.mentionedMeetingIds;

      streamingStore.start(assistantMsgId);
      let hasStartedStreaming = false;
      let streamStartTime = 0;

      const temporalContext = formatTemporalContext();

      const config = buildChatRequest({
        contextBlock: contextBlock || undefined,
        hasToolAccess: !!(resolved && supportsTools(resolved)),
        meetingCount: (injectedRefs.historyItems || []).length,
        temporalContext,
      });

      const allCitations: MeetingCitation[] = [];
      const allWebCitations: WebCitation[] = [];
      const webCitationUrls = new Set<string>();
      const allInlineCitations: InlineCitationSpan[] = [];

      const handleChunk = (
        chunk: string,
        metadata?: {
          isThinking?: boolean;
          isSearching?: boolean;
          searchQuery?: string;
          thinkingContent?: string;
          webCitations?: WebCitation[];
          inlineCitations?: InlineCitationSpan[];
        }
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
          if (!hasStartedStreaming) {
            hasStartedStreaming = true;
            streamStartTime = Date.now();
            set({ aiActivity: null });
            const cacheS = loadedSessionsCache.get(activeSessionId);
            if (cacheS) {
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
            }
          } else if (streamStartTime === 0) {
            streamStartTime = Date.now();
          }
          streamingStore.push(chunk);
        }
      };

      const handleMediaPart = (part: ChatPart) => {
        if (!hasStartedStreaming) {
          hasStartedStreaming = true;
          streamStartTime = Date.now();
          set({ aiActivity: null });
          const cacheS = loadedSessionsCache.get(activeSessionId);
          if (cacheS) {
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
          }
        }
        streamingStore.pushPart(part);
      };

      const hasToolSupport = !!(resolved && supportsTools(resolved));

      const orchestrateResult = await orchestrate(
        {
          messages: targetSession.messages.filter(
            (m) => m.state !== 'loading' && m.state !== 'streaming'
          ),
          systemPrompt: config.systemPrompt,
          contextBlock: contextBlock || undefined,
          settings: effectiveSettings,
          providers: effectiveProviders,
          historyItems: injectedRefs.historyItems || [],
          signal: abortControllerRef?.signal,
          webSearchEnabled,
          skipRetrieval: !hasToolSupport,
          temporalContext,
          mentionedMeetingIds,
        },
        {
          onChunk: handleChunk,
          onMediaPart: handleMediaPart,
          onToolActivity: (activity) => {
            if (!hasStartedStreaming) {
              hasStartedStreaming = true;
              const cacheS = loadedSessionsCache.get(activeSessionId);
              if (cacheS) {
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
              }
            }

            const toolCallId = activity.toolCall.id;

            if (activity.status === 'calling') {
              streamingStore.pushPart({
                type: 'tool_call',
                toolCallId,
                toolName: activity.toolName,
                arguments: activity.toolCall.arguments,
                status: 'calling',
              });
            } else if (activity.status === 'done') {
              const isError = activity.result?.isError ?? false;
              const content = activity.result?.content?.slice(0, 500) ?? 'Done';
              const executionMs = activity.result?.meta?.executionMs;

              streamingStore.updatePartByKey(toolCallId, (prev) => ({
                ...(prev as Extract<ChatPart, { type: 'tool_call' }>),
                status: isError ? ('error' as const) : ('complete' as const),
                result: { content, isError, executionMs },
              }));

              const newCitations = activity.result?.meta?.citations ?? [];
              for (const citation of newCitations) {
                const existingIdx = allCitations.findIndex(
                  (c) => c.meetingId === citation.meetingId
                );
                if (existingIdx === -1) {
                  allCitations.push(citation);
                } else if (citation.score > allCitations[existingIdx].score) {
                  allCitations[existingIdx] = citation;
                }
              }
            }
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
export const useChatAiActivity = () => useChatStore((s) => s.aiActivity);
export const useChatDeleteConfirmId = () => useChatStore((s) => s.deleteConfirmId);
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
  const setDeleteConfirmId = useChatStore((s) => s.setDeleteConfirmId);
  const rerunLastMessage = useChatStore((s) => s.rerunLastMessage);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const clearAttachments = useChatStore((s) => s.clearAttachments);
  const addScreenshotAttachment = useChatStore((s) => s.addScreenshotAttachment);
  const getOrCreateMeetingSession = useChatStore((s) => s.getOrCreateMeetingSession);
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
    setDeleteConfirmId,
    rerunLastMessage,
    addAttachment,
    removeAttachment,
    clearAttachments,
    addScreenshotAttachment,
    getOrCreateMeetingSession,
    loadMoreSessions,
  };
};
