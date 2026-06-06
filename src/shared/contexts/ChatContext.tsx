/**
 * Chat Context
 *
 * Manages chat sessions, messages, and chat UI state.
 * Uses two-tier loading: lightweight session index at startup + demand-loaded sessions on select.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useRef, useEffect, MutableRefObject } from 'react';
import type { ChatSession, ChatMessage, ChatPart, ChatIndexEntry, AppSettings, HistoryItem, MeetingCitation, WebCitation, InlineCitationSpan } from '@shared/types';
import { fileToBase64 } from '@shared/utils/file.utils';
import type { ModelProvider } from '@shared/types/modelProviders';
import { chatService } from '@services/chat.service';
import { unifiedAIService } from '@services/unifiedAIService';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { resolveModel, supportsTools } from '@shared/utils/modelResolver';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate } from '@extensions/tool-orchestrator';
import { streamingStore } from '@features/chat/stores/streamingStore';
import { buildChatRequest, formatTemporalContext } from '@core/ai';
import { generateSuggestions } from '@services/ai/suggestions';
import { logUsage } from '@extensions/usage';
import { CHAT_PAGE_SIZE, MAX_LOADED_SESSIONS, SIDEBAR_SEARCH_DEBOUNCE_MS } from '@config/chat.config';

interface ChatState {
  /** Lightweight index — loaded once at startup, no messages */
  sessionIndex: ChatIndexEntry[];
  /** Demand-loaded sessions — LRU-capped at MAX_LOADED_SESSIONS */
  loadedSessions: Map<string, ChatSession>;
  /** Current active session ID */
  currentSessionId: string | null;
  /** True while loading a session on select */
  isSessionLoading: boolean;
  /** Pagination: pages × CHAT_PAGE_SIZE entries shown in sidebar */
  indexPage: number;
  /** Chat input text */
  input: string;
  /** Whether chat is loading */
  isLoading: boolean;
  /** Whether viewing chat history */
  viewHistory: boolean;
  /** Chat search query */
  searchQuery: string;
  /** Debounced search query */
  debouncedSearchQuery: string;
  /** Copied message ID */
  copiedMessageId: string | null;
  /** Selected meetings for context */
  selectedMeetingRefs: MeetingListItem[];
  /** Whether web search is enabled */
  webSearchEnabled: boolean;
  /** Current AI activity state (thinking / web search only) */
  aiActivity: {
    isThinking?: boolean;
    isSearching?: boolean;
    searchQuery?: string;
    thinkingContent?: string;
  } | null;
  /** Chat session pending delete confirmation */
  deleteConfirmId: string | null;
  /** Pending file attachments for the next message */
  pendingAttachments: ChatPart[];
}

interface ChatContextValue extends Omit<ChatState, 'loadedSessions'> {
  /** Current active session (demand-loaded) */
  currentSession: ChatSession | null;
  /** Filtered+paginated index entries based on search and page */
  filteredIndexEntries: ChatIndexEntry[];
  /** Set chat input */
  setInput: (input: string) => void;
  /** Set current session ID */
  setCurrentSessionId: (id: string | null) => void;
  /** Set view history mode */
  setViewHistory: (view: boolean) => void;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Create a new chat session */
  newChat: () => void;
  /** Send a message */
  sendMessage: (text?: string, historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => Promise<void>;
  /** Load chat sessions index from storage */
  loadSessions: () => Promise<void>;
  /** Select a chat session (synchronous — triggers demand-load via useEffect) */
  selectSession: (sessionId: string) => void;
  /** Delete a chat session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Rename a chat session */
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  /** Stop current LLM call */
  stopGeneration: () => void;
  /** Copy message content */
  copyMessage: (messageId: string, text: string) => void;
  /** Set selected meeting references */
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  /** Toggle web search */
  toggleWebSearch: () => void;
  /** Set delete confirmation ID */
  setDeleteConfirmId: (id: string | null) => void;
  /** Rerun the last assistant message */
  rerunLastMessage: (historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => Promise<void>;
  /** Add a file attachment */
  addAttachment: (file: File) => Promise<void>;
  /** Remove a pending attachment by index */
  removeAttachment: (index: number) => void;
  /** Clear all pending attachments */
  clearAttachments: () => void;
  /** Add a screenshot as an image attachment (base64 PNG) */
  addScreenshotAttachment: (base64: string, name: string) => void;
  /** Get or create a chat session scoped to a meeting */
  getOrCreateMeetingSession: (meetingId: string, meetingTitle: string) => void;
  /** Load more sessions in the sidebar (pagination) */
  loadMoreSessions: () => void;
  /** Ref for programmatically focusing the chat input textarea */
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
}

const initialState: ChatState = {
  sessionIndex: [],
  loadedSessions: new Map(),
  currentSessionId: null,
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
};

const ChatContext = createContext<ChatContextValue | null>(null);

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [state, setState] = useState<ChatState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Ref mirrors loadedSessions Map for synchronous reads inside callbacks (stale-closure safe)
  const loadedSessionsCacheRef = useRef<Map<string, ChatSession>>(new Map());

  // Helper — always use this to update loadedSessions so ref stays in sync
  const setLoadedSessions = useCallback((updater: (prev: Map<string, ChatSession>) => Map<string, ChatSession>) => {
    setState(prev => {
      const next = updater(prev.loadedSessions);
      loadedSessionsCacheRef.current = next;
      return { ...prev, loadedSessions: next };
    });
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setState(prev => ({ ...prev, debouncedSearchQuery: prev.searchQuery }));
    }, SIDEBAR_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.searchQuery]);

  // Auto-load sessions index on mount
  useEffect(() => {
    const initializeSessions = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadSessions();
      setIsInitialized(true);
    };
    initializeSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save current session when it changes (debounced)
  useEffect(() => {
    if (!isInitialized) return;
    if (!state.currentSessionId) return;

    const timeoutId = setTimeout(() => {
      const session = loadedSessionsCacheRef.current.get(state.currentSessionId!);
      if (session) persistSession(session);
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loadedSessions, state.currentSessionId, isInitialized]);

  // Demand-load session when currentSessionId changes
  useEffect(() => {
    const sessionId = state.currentSessionId;
    if (!sessionId) return;
    if (loadedSessionsCacheRef.current.has(sessionId)) return;

    let cancelled = false;

    chatService.loadSession(sessionId)
      .then(session => {
        if (cancelled) return;
        if (!session) {
          setState(prev => ({ ...prev, isSessionLoading: false }));
          return;
        }
        setLoadedSessions(prev => {
          const next = new Map(prev);
          // LRU eviction: remove oldest non-current session if over cap
          if (next.size >= MAX_LOADED_SESSIONS) {
            for (const [id] of next) {
              if (id !== sessionId) {
                next.delete(id);
                break;
              }
            }
          }
          next.set(sessionId, session);
          return next;
        });
        setState(prev => ({ ...prev, isSessionLoading: false }));
      })
      .catch(err => {
        if (!cancelled) {
          console.error('[ChatContext] Failed to load session:', sessionId, err);
          setState(prev => ({ ...prev, isSessionLoading: false }));
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentSessionId]);

  // Current session — derived from cache
  const currentSession = useMemo(() => {
    if (!state.currentSessionId) return null;
    return state.loadedSessions.get(state.currentSessionId) ?? null;
  }, [state.loadedSessions, state.currentSessionId]);

  // Filtered + paginated index entries (title-only filter)
  const filteredIndexEntries = useMemo((): ChatIndexEntry[] => {
    const { debouncedSearchQuery, sessionIndex, indexPage } = state;

    if (!debouncedSearchQuery) {
      return sessionIndex.slice(0, indexPage * CHAT_PAGE_SIZE);
    }

    const q = debouncedSearchQuery.toLowerCase();
    return sessionIndex.filter(e => e.title.toLowerCase().includes(q));
  }, [state.sessionIndex, state.debouncedSearchQuery, state.indexPage]);

  // Load session index from storage (no messages)
  const loadSessions = useCallback(async () => {
    try {
      const indexEntries = await chatService.listSessions();
      setState(prev => ({ ...prev, sessionIndex: indexEntries }));
      console.log('[ChatContext] Loaded index with', indexEntries.length, 'sessions');
    } catch (error) {
      console.error('[ChatContext] Error loading session index:', error);
    }
  }, []);

  // Persist a session — writes to disk, updates cache + index
  const persistSession = useCallback(async (session: ChatSession) => {
    await chatService.persistSession(session);
    setLoadedSessions(prev => {
      const next = new Map(prev);
      next.set(session.id, session);
      return next;
    });
    setState(prev => ({
      ...prev,
      sessionIndex: prev.sessionIndex.map(e =>
        e.id === session.id
          ? { ...e, title: session.title, lastMessageAt: session.lastMessageAt, messageCount: session.messages.length }
          : e
      ),
    }));
  }, [setLoadedSessions]);

  // Simple setters
  const setInput = useCallback((input: string) => {
    setState(prev => ({ ...prev, input }));
  }, []);

  const setCurrentSessionId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, currentSessionId: id }));
  }, []);

  const setViewHistory = useCallback((viewHistory: boolean) => {
    setState(prev => ({ ...prev, viewHistory }));
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    setState(prev => ({ ...prev, searchQuery }));
  }, []);

  const newChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentSessionId: null,
      input: '',
      viewHistory: false,
      searchQuery: '',
    }));
  }, []);

  // Synchronous — just set currentSessionId; demand-load fires in useEffect
  const selectSession = useCallback((sessionId: string) => {
    setState(prev => ({
      ...prev,
      currentSessionId: sessionId,
      viewHistory: false,
      isSessionLoading: !loadedSessionsCacheRef.current.has(sessionId),
    }));
  }, []);

  const loadMoreSessions = useCallback(() => {
    setState(prev => ({ ...prev, indexPage: prev.indexPage + 1 }));
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await chatService.deleteSession(sessionId);
      setLoadedSessions(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setState(prev => ({
        ...prev,
        sessionIndex: prev.sessionIndex.filter(e => e.id !== sessionId),
        currentSessionId: prev.currentSessionId === sessionId ? null : prev.currentSessionId,
      }));
    } catch (error) {
      console.error('[ChatContext] Error deleting session:', error);
    }
  }, [setLoadedSessions]);

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      await chatService.renameSession(sessionId, newTitle);
      setLoadedSessions(prev => {
        const existing = prev.get(sessionId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(sessionId, { ...existing, title: newTitle });
        return next;
      });
      setState(prev => ({
        ...prev,
        sessionIndex: prev.sessionIndex.map(e =>
          e.id === sessionId ? { ...e, title: newTitle } : e
        ),
      }));
    } catch (error) {
      console.error('[ChatContext] Error renaming session:', error);
    }
  }, [setLoadedSessions]);

  const copyMessage = useCallback((messageId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setState(prev => ({ ...prev, copiedMessageId: messageId }));
    setTimeout(() => {
      setState(prev => ({ ...prev, copiedMessageId: null }));
    }, 2000);
  }, []);

  const setSelectedMeetingRefs = useCallback((selectedMeetingRefs: MeetingListItem[]) => {
    setState(prev => ({ ...prev, selectedMeetingRefs }));
  }, []);

  const toggleWebSearch = useCallback(() => {
    setState(prev => ({ ...prev, webSearchEnabled: !prev.webSearchEnabled }));
  }, []);

  const setDeleteConfirmId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, deleteConfirmId: id }));
  }, []);

  const MAX_ATTACHMENTS = 10;

  const addAttachment = useCallback(async (file: File) => {
    if (state.pendingAttachments.length >= MAX_ATTACHMENTS) return;

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
        part = { type: 'document', mimeType: file.type || 'application/octet-stream', source, fileName: file.name };
      }

      setState(prev => ({
        ...prev,
        pendingAttachments: [...prev.pendingAttachments, part],
      }));
    } catch (error: any) {
      console.error('[ChatContext] Failed to add attachment:', error.message);
    }
  }, [state.pendingAttachments.length]);

  const removeAttachment = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      pendingAttachments: prev.pendingAttachments.filter((_, i) => i !== index),
    }));
  }, []);

  const clearAttachments = useCallback(() => {
    setState(prev => ({ ...prev, pendingAttachments: [] }));
  }, []);

  const addScreenshotAttachment = useCallback((base64: string, name: string) => {
    const part: ChatPart = {
      type: 'image',
      mimeType: 'image/png',
      source: { kind: 'data', base64 },
      alt: name,
    };
    setState(prev => ({
      ...prev,
      pendingAttachments: prev.pendingAttachments.length < MAX_ATTACHMENTS
        ? [...prev.pendingAttachments, part]
        : prev.pendingAttachments,
    }));
  }, []);

  const getOrCreateMeetingSession = useCallback((meetingId: string, meetingTitle: string) => {
    // Search loaded cache first (recently used sessions)
    for (const [id, session] of loadedSessionsCacheRef.current) {
      if (session.meetingId === meetingId) {
        setState(prev => ({ ...prev, currentSessionId: id, viewHistory: false }));
        return;
      }
    }

    // Not in cache — create a new session
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: `Chat: ${meetingTitle}`,
      lastMessageAt: Date.now(),
      messages: [],
      meetingId,
    };

    setLoadedSessions(prev => {
      const next = new Map(prev);
      next.set(newSession.id, newSession);
      return next;
    });

    setState(prev => ({
      ...prev,
      sessionIndex: [
        { id: newSession.id, title: newSession.title, lastMessageAt: newSession.lastMessageAt },
        ...prev.sessionIndex,
      ],
      currentSessionId: newSession.id,
      viewHistory: false,
    }));
  }, [setLoadedSessions]);

  // Send message
  const sendMessage = useCallback(async (textOverride?: string, historyItems?: HistoryItem[], settings?: AppSettings, providers?: ModelProvider[], options?: { regenerate?: boolean }) => {
    const textToSend = textOverride || state.input;
    if (!textToSend.trim() || state.isLoading) return;

    const isRegenerate = options?.regenerate === true;
    const isNewSession = !state.currentSessionId;
    const activeSessionId = state.currentSessionId || Date.now().toString();

    let targetSession: ChatSession;

    if (isNewSession) {
      targetSession = {
        id: activeSessionId,
        title: textToSend.slice(0, 30),
        lastMessageAt: Date.now(),
        messages: [],
      };
      // Add to index + cache immediately
      setState(prev => ({
        ...prev,
        sessionIndex: [
          { id: activeSessionId, title: targetSession.title, lastMessageAt: Date.now() },
          ...prev.sessionIndex,
        ],
        currentSessionId: activeSessionId,
        input: isRegenerate ? prev.input : '',
        isLoading: true,
        selectedMeetingRefs: [],
        pendingAttachments: isRegenerate ? prev.pendingAttachments : [],
      }));
      setLoadedSessions(prev => {
        const next = new Map(prev);
        next.set(activeSessionId, targetSession);
        return next;
      });
    } else {
      const cached = loadedSessionsCacheRef.current.get(activeSessionId);
      if (!cached) {
        console.error('[ChatContext] sendMessage: session not in cache', activeSessionId);
        return;
      }
      targetSession = { ...cached };
      setState(prev => ({
        ...prev,
        input: isRegenerate ? prev.input : '',
        isLoading: true,
        selectedMeetingRefs: [],
        pendingAttachments: isRegenerate ? prev.pendingAttachments : [],
      }));
    }

    // Clear suggestions from previous messages
    targetSession.messages = targetSession.messages.map(msg => {
      if (msg.suggestions && msg.suggestions.length > 0) {
        const { suggestions: _, ...msgWithoutSuggestions } = msg;
        return msgWithoutSuggestions;
      }
      return msg;
    });

    const selectedRefs = state.selectedMeetingRefs;

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
        parts: state.pendingAttachments.length > 0
          ? [{ type: 'text' as const, text: textToSend }, ...state.pendingAttachments]
          : undefined,
        meetingRefs: selectedRefs.length > 0
          ? selectedRefs.map(m => ({ id: m.id, title: m.title }))
          : undefined,
        timestamp: Date.now(),
      };
      targetSession.messages.push(userMsg);
    }

    targetSession.lastMessageAt = Date.now();

    // Sync modified session into cache
    setLoadedSessions(prev => {
      const next = new Map(prev);
      next.set(activeSessionId, targetSession);
      return next;
    });

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Persist user message immediately
    await persistSession(targetSession);

    // Resolve model
    const defaultSettings = {
      transcriptionModel: '',
      chatModel: '',
      apiKey: '',
      audioQualityPreset: 'voice' as const,
    };
    const effectiveSettings = settings || defaultSettings;
    const effectiveProviders = providers || [];
    const resolved = resolveModel(effectiveSettings.chatModel, effectiveProviders);

    // Guard: no model selected
    if (!resolved) {
      const noModelMsgId = (Date.now() + 1).toString();
      setLoadedSessions(prev => {
        const existing = prev.get(activeSessionId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(activeSessionId, {
          ...existing,
          messages: [...existing.messages, {
            id: noModelMsgId,
            role: 'model' as const,
            text: 'Please select a model from the picker in the toolbar before sending a message.',
            timestamp: Date.now(),
            state: 'complete' as const,
          }],
          lastMessageAt: Date.now(),
        });
        return next;
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Create assistant message placeholder
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      provider: resolved?.provider,
      model: resolved?.modelId,
      state: 'loading',
    };

    setLoadedSessions(prev => {
      const existing = prev.get(activeSessionId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(activeSessionId, {
        ...existing,
        messages: [...existing.messages, assistantMsg],
        lastMessageAt: Date.now(),
      });
      return next;
    });

    try {
      const pipelineResult = await contextPipeline.resolve({
        userMessage: textToSend,
        conversationMessages: targetSession.messages,
        historyItems: historyItems || [],
        settings: effectiveSettings,
        providers: effectiveProviders,
        manualMeetingRefs: selectedRefs,
        signal: abortControllerRef.current?.signal,
      });
      const contextBlock = pipelineResult.text;
      const mentionedMeetingIds = pipelineResult.mentionedMeetingIds;

      streamingStore.start(assistantMsgId);
      let hasStartedStreaming = false;
      let streamStartTime = 0;

      const temporalContext = formatTemporalContext();

      const config = buildChatRequest({
        contextBlock: contextBlock || undefined,
        hasTools: !!(resolved && supportsTools(resolved)),
        meetingCount: (historyItems || []).length,
        temporalContext,
      });

      const handleChunk = (chunk: string, metadata?: { isThinking?: boolean; isSearching?: boolean; searchQuery?: string; thinkingContent?: string; webCitations?: WebCitation[]; inlineCitations?: InlineCitationSpan[] }) => {
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
          setState(prev => ({ ...prev, aiActivity: metadata }));
        }

        if (chunk) {
          if (!hasStartedStreaming) {
            hasStartedStreaming = true;
            streamStartTime = Date.now();
            setState(prev => ({ ...prev, aiActivity: null }));
            setLoadedSessions(prev => {
              const existing = prev.get(activeSessionId);
              if (!existing) return prev;
              const next = new Map(prev);
              next.set(activeSessionId, {
                ...existing,
                messages: existing.messages.map(m =>
                  m.id === assistantMsgId ? { ...m, state: 'streaming' as const } : m
                ),
              });
              return next;
            });
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
          setState(prev => ({ ...prev, aiActivity: null }));
          setLoadedSessions(prev => {
            const existing = prev.get(activeSessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(activeSessionId, {
              ...existing,
              messages: existing.messages.map(m =>
                m.id === assistantMsgId ? { ...m, state: 'streaming' as const } : m
              ),
            });
            return next;
          });
        }
        streamingStore.pushPart(part);
      };

      const hasToolSupport = !!(resolved && supportsTools(resolved));

      const allCitations: MeetingCitation[] = [];
      const allWebCitations: WebCitation[] = [];
      const webCitationUrls = new Set<string>();
      const allInlineCitations: InlineCitationSpan[] = [];

      let tokenUsageResult: { inputTokens?: number; outputTokens?: number } | undefined;

      const messagesForProvider = targetSession.messages.filter(
        m => m.state !== 'loading' && m.state !== 'streaming'
      );

      const orchestrateResult = await orchestrate(
        {
          messages: messagesForProvider,
          systemPrompt: config.systemPrompt,
          contextBlock: contextBlock || undefined,
          settings: effectiveSettings,
          providers: effectiveProviders,
          historyItems: historyItems || [],
          signal: abortControllerRef.current?.signal,
          webSearchEnabled: state.webSearchEnabled,
          toolChoice: 'auto',
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
              setLoadedSessions(prev => {
                const existing = prev.get(activeSessionId);
                if (!existing) return prev;
                const next = new Map(prev);
                next.set(activeSessionId, {
                  ...existing,
                  messages: existing.messages.map(m =>
                    m.id === assistantMsgId ? { ...m, state: 'streaming' as const } : m
                  ),
                });
                return next;
              });
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
                status: isError ? 'error' as const : 'complete' as const,
                result: { content, isError, executionMs },
              }));

              const newCitations = activity.result?.meta?.citations ?? [];
              for (const citation of newCitations) {
                const existing = allCitations.findIndex(c => c.meetingId === citation.meetingId);
                if (existing === -1) {
                  allCitations.push(citation);
                } else if (citation.score > allCitations[existing].score) {
                  allCitations[existing] = citation;
                }
              }
            }
          },
        }
      );
      tokenUsageResult = orchestrateResult.tokenUsage;

      logUsage({
        category: 'chat',
        sessionId: activeSessionId,
        provider: orchestrateResult.provider,
        model: orchestrateResult.model,
        usage: orchestrateResult.tokenUsage,
      }).catch(e => console.error('[UsageLog] chat:', e));

      // Stream complete — flush store and commit final state
      const streamResult = streamingStore.finish();
      const mainText = streamResult.text;
      const finalParts: ChatPart[] = streamResult.parts
        .filter(p => p.type !== 'text' || (p as Extract<ChatPart, { type: 'text' }>).text.length > 0);

      const tokenCount = tokenUsageResult?.outputTokens;
      const inputTokenCount = tokenUsageResult?.inputTokens;
      const streamDurationSec = streamStartTime > 0 ? (Date.now() - streamStartTime) / 1000 : 0;
      const tokensPerSecond = tokenCount && streamDurationSec > 0.05
        ? Math.round(tokenCount / streamDurationSec)
        : undefined;

      const existingSession = loadedSessionsCacheRef.current.get(activeSessionId);
      if (existingSession) {
        const finalSession: ChatSession = {
          ...existingSession,
          messages: existingSession.messages.map(m =>
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
        setLoadedSessions(prev => {
          const next = new Map(prev);
          next.set(activeSessionId, finalSession);
          return next;
        });
        persistSession(finalSession);
      }

      setState(prev => ({ ...prev, isLoading: false, aiActivity: null }));

      // Title generation for new sessions
      if (isNewSession) {
        unifiedAIService
          .generateTitle(textToSend, mainText, effectiveSettings, effectiveProviders)
          .then(({ title, usage: titleUsage }) => {
            renameSession(activeSessionId, title);
            logUsage({
              category: 'title-gen',
              sessionId: activeSessionId,
              provider: orchestrateResult.provider,
              model: orchestrateResult.model,
              usage: titleUsage,
            }).catch(e => console.error('[UsageLog] title-gen:', e));
          })
          .catch(() => { /* best-effort */ });
      }

      // Generate suggestions async (best-effort)
      if (resolved) {
        generateSuggestions({
          resolved,
          userMessage: textToSend,
          responsePreview: mainText.slice(0, 500),
          signal: abortControllerRef.current?.signal,
        }).then(suggestions => {
          if (suggestions.length > 0) {
            const sessionForSuggestions = loadedSessionsCacheRef.current.get(activeSessionId);
            if (sessionForSuggestions) {
              const updatedSession = {
                ...sessionForSuggestions,
                messages: sessionForSuggestions.messages.map(m =>
                  m.id === assistantMsgId ? { ...m, suggestions } : m
                ),
              };
              setLoadedSessions(prev => {
                const next = new Map(prev);
                next.set(activeSessionId, updatedSession);
                return next;
              });
              persistSession(updatedSession);
            }
          }
        }).catch(() => { /* suggestions are best-effort */ });
      }
    } catch (error: any) {
      console.error('[ChatContext] Error sending message:', error);
      streamingStore.reset();

      if (error.name === 'AbortError' || error.message?.includes('abort')) {
        const abortedSession = loadedSessionsCacheRef.current.get(activeSessionId);
        if (abortedSession) {
          setLoadedSessions(prev => {
            const existing = prev.get(activeSessionId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(activeSessionId, {
              ...existing,
              messages: existing.messages.map(m => {
                if (m.id !== assistantMsgId || m.state === 'complete') return m;
                return { ...m, text: m.text || '[Stopped]', state: 'complete' as const };
              }),
            });
            return next;
          });
        }
        setState(prev => ({ ...prev, isLoading: false, aiActivity: null }));
        return;
      }

      const errorSession = loadedSessionsCacheRef.current.get(activeSessionId);
      if (errorSession) {
        const failedSession: ChatSession = {
          ...errorSession,
          messages: errorSession.messages.map(m =>
            m.id === assistantMsgId
              ? { ...m, text: error.message || 'Failed to get response', isError: true, state: 'complete' as const }
              : m
          ),
          lastMessageAt: Date.now(),
        };
        setLoadedSessions(prev => {
          const next = new Map(prev);
          next.set(activeSessionId, failedSession);
          return next;
        });
        persistSession(failedSession);
      }
      setState(prev => ({ ...prev, isLoading: false }));
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.input, state.isLoading, state.currentSessionId, state.selectedMeetingRefs, state.webSearchEnabled, persistSession, setLoadedSessions]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      const streamResult = streamingStore.finish();

      setState(prev => {
        const currentId = prev.currentSessionId;
        if (!currentId) return { ...prev, isLoading: false, aiActivity: null };

        const existingSession = loadedSessionsCacheRef.current.get(currentId);
        if (!existingSession) return { ...prev, isLoading: false, aiActivity: null };

        const stoppedSession: ChatSession = {
          ...existingSession,
          messages: existingSession.messages.map(m => {
            if (m.state !== 'loading' && m.state !== 'streaming') return m;
            const text = streamResult.text || m.text || '[Stopped]';
            const parts = streamResult.parts.length > 0 ? streamResult.parts : m.parts;
            return { ...m, text, parts, state: 'complete' as const };
          }),
        };

        const next = new Map(prev.loadedSessions);
        next.set(currentId, stoppedSession);
        loadedSessionsCacheRef.current = next;

        return { ...prev, loadedSessions: next, isLoading: false, aiActivity: null };
      });
    }
  }, []);

  const rerunLastMessage = useCallback(async (historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => {
    const session = state.currentSessionId
      ? loadedSessionsCacheRef.current.get(state.currentSessionId)
      : null;
    if (!session || session.messages.length < 2) return;

    const messages = session.messages;
    const lastIdx = messages.length - 1;
    if (messages[lastIdx]?.role !== 'model') return;

    const lastUserMsg = messages[lastIdx - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    await sendMessage(lastUserMsg.text, historyItems, settings, providers, { regenerate: true });
  }, [state.currentSessionId, sendMessage]);

  // Exclude loadedSessions (Map) from context value — consumers use currentSession instead
  const { loadedSessions: _loadedSessions, ...stateForContext } = state;

  const value: ChatContextValue = {
    ...stateForContext,
    currentSession,
    filteredIndexEntries,
    setInput,
    setCurrentSessionId,
    setViewHistory,
    setSearchQuery,
    newChat,
    sendMessage,
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
    chatInputRef,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

/**
 * useChat Hook
 *
 * Access chat state and operations.
 */
export const useChat = (): ChatContextValue => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export default ChatContext;
