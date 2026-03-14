/**
 * Chat Context
 * 
 * Manages chat sessions, messages, and chat UI state.
 * Integrates stream buffer for smooth text rendering.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useRef, useEffect, MutableRefObject } from 'react';
import type { ChatSession, ChatMessage, ChatPart, AppSettings, HistoryItem, MeetingCitation, WebCitation, InlineCitationSpan } from '@/types';
import { fileToBase64 } from '@/utils/fileUtils';
import type { ChatThread as StoredChatThread, ChatMessage as StoredChatMessage } from '@/services/storage';
import type { ModelProvider } from '@/types/modelProviders';
import { isTauriEnvironment } from '@/services/tauri';
import { chatsService } from '@/services/storage';
import { unifiedAIService } from '@/services/unifiedAIService';
import type { MeetingListItem } from '@/services/meetingReferenceService';
import { resolveModel, supportsTools, getProviderType } from '@shared/utils/modelResolver';
import { getAdapter } from '@/services/adapters';
import { contextPipeline } from '@extensions/context-pipeline';
import { orchestrate } from '@extensions/tool-orchestrator';
import { streamingStore } from '@features/chat/stores/streamingStore';
import { buildChatRequest } from '@core/ai';
import { JsonStreamExtractor } from '@core/ai/streaming/jsonStreamExtractor';
import { modalitiesService } from '@/services/modalities';

interface ChatState {
  /** All chat sessions */
  sessions: ChatSession[];
  /** Current active session ID */
  currentSessionId: string | null;
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
  /** Whether chat panel is open */
  isChatOpen: boolean;
  /** Selected meetings for context */
  selectedMeetingRefs: MeetingListItem[];
  /** Whether web search is enabled */
  webSearchEnabled: boolean;
  /** Current AI activity state */
  aiActivity: {
    // Existing (keep for Anthropic thinking / web search)
    isThinking?: boolean;
    isSearching?: boolean;
    searchQuery?: string;
    thinkingContent?: string;
    // Tool calling
    isCallingTool?: boolean;
    toolName?: string;
    toolPhase?: 'calling' | 'executing' | 'result' | 'error';
    toolDetail?: string;
    toolIteration?: number;
  } | null;
  /** Chat session pending delete confirmation */
  deleteConfirmId: string | null;
  /** Pending file attachments for the next message */
  pendingAttachments: ChatPart[];
}

interface FilteredChatSession extends ChatSession {
  matchingMsg?: ChatMessage;
}

interface ChatContextValue extends ChatState {
  /** Current active session */
  currentSession: ChatSession | null;
  /** Filtered sessions based on search */
  filteredSessions: FilteredChatSession[];
  /** Set chat input */
  setInput: (input: string) => void;
  /** Set current session ID */
  setCurrentSessionId: (id: string | null) => void;
  /** Set view history mode */
  setViewHistory: (view: boolean) => void;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Toggle chat panel */
  toggleChat: () => void;
  /** Open chat panel */
  openChat: () => void;
  /** Close chat panel */
  closeChat: () => void;
  /** Create a new chat session */
  newChat: () => void;
  /** Send a message */
  sendMessage: (text?: string, historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => Promise<void>;
  /** Load chat sessions from storage */
  loadSessions: () => Promise<void>;
  /** Select a chat session */
  selectSession: (sessionId: string) => void;
  /** Delete a chat session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Rename a chat session */
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  /** Stop current LLM call */
  stopGeneration: () => void;
  /** Copy message content */
  copyMessage: (messageId: string, text: string) => void;
  /** Set sessions directly */
  setSessions: (sessions: ChatSession[]) => void;
  /** Set selected meeting references */
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  /** Toggle web search */
  toggleWebSearch: () => void;
  /** Set delete confirmation ID */
  setDeleteConfirmId: (id: string | null) => void;
  /** Rerun the last assistant message (resend the preceding user message) */
  rerunLastMessage: (historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => Promise<void>;
  /** Add a file attachment */
  addAttachment: (file: File) => Promise<void>;
  /** Remove a pending attachment by index */
  removeAttachment: (index: number) => void;
  /** Clear all pending attachments */
  clearAttachments: () => void;
  /** Add a screenshot as an image attachment (base64 PNG) */
  addScreenshotAttachment: (base64: string, name: string) => void;
  /** Ref for programmatically focusing the chat input textarea */
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
}

const initialState: ChatState = {
  sessions: [],
  currentSessionId: null,
  input: '',
  isLoading: false,
  viewHistory: false,
  searchQuery: '',
  debouncedSearchQuery: '',
  copiedMessageId: null,
  isChatOpen: false,
  selectedMeetingRefs: [],
  webSearchEnabled: false,
  aiActivity: null,
  deleteConfirmId: null,
  pendingAttachments: [],
};

const ChatContext = createContext<ChatContextValue | null>(null);

// Convert stored message to app message
const fromStoredMessage = (msg: StoredChatMessage): ChatMessage => ({
  id: msg.id,
  role: msg.role === 'assistant' ? 'model' : 'user',
  text: msg.content,
  parts: msg.parts as ChatPart[] | undefined,
  timestamp: new Date(msg.timestamp).getTime(),
  provider: msg.provider,
  model: msg.model,
  suggestions: msg.suggestions,
  state: msg.role === 'assistant' ? 'complete' : undefined,
  tokenCount: msg.tokenCount,
  tokensPerSecond: msg.tokensPerSecond,
  toolActivity: msg.toolActivity,
  webCitations: msg.webCitations,
  inlineCitations: msg.inlineCitations,
});

// Convert app message to stored message
const toStoredMessage = (msg: ChatMessage): StoredChatMessage => ({
  id: msg.id,
  role: msg.role === 'model' ? 'assistant' : 'user',
  content: msg.text,
  parts: msg.parts,
  timestamp: new Date(msg.timestamp).toISOString(),
  provider: msg.provider,
  model: msg.model,
  suggestions: msg.suggestions,
  tokenCount: msg.tokenCount,
  tokensPerSecond: msg.tokensPerSecond,
  toolActivity: msg.toolActivity,
  webCitations: msg.webCitations,
  inlineCitations: msg.inlineCitations,
});

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [state, setState] = useState<ChatState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setState(prev => ({ ...prev, debouncedSearchQuery: prev.searchQuery }));
    }, 300);
    return () => clearTimeout(timer);
  }, [state.searchQuery]);

  // Auto-load sessions on mount (with delay to ensure storage is initialized)
  useEffect(() => {
    const initializeSessions = async () => {
      // Wait a bit to ensure storage is initialized (App.tsx initializes storage first)
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadSessions();
      setIsInitialized(true);
    };
    
    initializeSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Auto-save sessions when they change (debounced, similar to SettingsContext)
  useEffect(() => {
    if (!isInitialized) return; // Don't save during initial load

    const timeoutId = setTimeout(() => {
      // Persist all sessions that have changed
      if (state.sessions.length > 0 && isTauriEnvironment()) {
        console.log('[ChatContext] Auto-saving sessions...');
        // We can't persist all sessions at once easily, but we can persist the current one
        // which is the most likely to have changed
        if (state.currentSessionId) {
          const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
          if (currentSession) {
            persistSession(currentSession);
          }
        }
      }
    }, 500); // Debounce saves by 500ms (same as SettingsContext)

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessions, state.currentSessionId, isInitialized]); // Don't include persistSession to avoid circular deps

  // Current session
  const currentSession = useMemo(() => {
    return state.sessions.find(s => s.id === state.currentSessionId) || null;
  }, [state.sessions, state.currentSessionId]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    if (!state.debouncedSearchQuery) return state.sessions;
    
    const lower = state.debouncedSearchQuery.toLowerCase();
    return state.sessions
      .map(session => {
        const titleMatch = session.title.toLowerCase().includes(lower);
        const matchingMsg = session.messages.find(m => m.text.toLowerCase().includes(lower));

        if (titleMatch || matchingMsg) {
          return { ...session, matchingMsg };
        }
        return null;
      })
      .filter(Boolean) as FilteredChatSession[];
  }, [state.sessions, state.debouncedSearchQuery]);

  // Load sessions from storage
  const loadSessions = useCallback(async () => {
    console.log('[ChatContext] loadSessions called, isTauri:', isTauriEnvironment());
    try {
      if (isTauriEnvironment()) {
        const result = await chatsService.listChats();
        console.log('[ChatContext] listChats result:', result.success, 'count:', result.data?.length || 0);
        if (result.success && result.data) {
          const sessions: ChatSession[] = result.data.map(thread => ({
            id: thread.id,
            title: thread.title || 'Untitled Chat',
            lastMessageAt: new Date(thread.updatedAt).getTime(), // Convert ISO string to timestamp
            messages: thread.messages.map(fromStoredMessage),
          }));
          setState(prev => ({ ...prev, sessions }));
          console.log('[ChatContext] Loaded', sessions.length, 'chat sessions from storage');
        } else if (!result.success) {
          console.error('[ChatContext] Failed to list chats:', result.error);
        }
      } else {
        const stored = localStorage.getItem('kasset_ai_chat_sessions');
        console.log('[ChatContext] localStorage sessions found:', !!stored);
        if (stored) {
          const parsed = JSON.parse(stored);
          setState(prev => ({ ...prev, sessions: parsed }));
          console.log('[ChatContext] Loaded', parsed.length, 'sessions from localStorage');
        }
      }
    } catch (error) {
      console.error('[ChatContext] Error loading sessions:', error);
    }
  }, []);

  // Persist a session
  const persistSession = useCallback(async (session: ChatSession) => {
    const storedMessages = session.messages.map(toStoredMessage);

    if (!isTauriEnvironment()) {
      const allSessions = state.sessions.map(s => 
        s.id === session.id ? session : s
      );
      if (!allSessions.find(s => s.id === session.id)) {
        allSessions.unshift(session);
      }
      localStorage.setItem('kasset_ai_chat_sessions', JSON.stringify(allSessions));
      console.log('[ChatContext] Persisted session to localStorage:', session.id);
      return;
    }

    console.log('[ChatContext] Persisting session to disk:', session.id, 'with', session.messages.length, 'messages');
    const existing = await chatsService.getChat(session.id);
    if (existing.success) {
      const result = await chatsService.updateChat(session.id, {
        title: session.title,
        messages: storedMessages,
      });
      if (result.success) {
        console.log('[ChatContext] ✓ Updated session on disk:', session.id);
      } else {
        console.error('[ChatContext] ✗ Failed to update session:', result.error);
      }
    } else {
      const result = await chatsService.saveChat(storedMessages, {
        id: session.id,
        title: session.title,
      });
      if (result.success) {
        console.log('[ChatContext] ✓ Saved new session to disk:', session.id);
      } else {
        console.error('[ChatContext] ✗ Failed to save session:', result.error);
      }
    }
  }, [state.sessions]);

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

  const toggleChat = useCallback(() => {
    setState(prev => ({ ...prev, isChatOpen: !prev.isChatOpen }));
  }, []);

  const openChat = useCallback(() => {
    setState(prev => ({ ...prev, isChatOpen: true }));
  }, []);

  const closeChat = useCallback(() => {
    setState(prev => ({ ...prev, isChatOpen: false }));
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

  const selectSession = useCallback((sessionId: string) => {
    setState(prev => ({
      ...prev,
      currentSessionId: sessionId,
      viewHistory: false,
    }));
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      if (isTauriEnvironment()) {
        await chatsService.deleteChat(sessionId);
      }

      setState(prev => {
        const newSessions = prev.sessions.filter(s => s.id !== sessionId);
        if (!isTauriEnvironment()) {
          localStorage.setItem('kasset_ai_chat_sessions', JSON.stringify(newSessions));
        }
        return {
          ...prev,
          sessions: newSessions,
          currentSessionId: prev.currentSessionId === sessionId ? null : prev.currentSessionId,
        };
      });
    } catch (error) {
      console.error('[ChatContext] Error deleting session:', error);
    }
  }, []);

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      if (isTauriEnvironment()) {
        await chatsService.updateChat(sessionId, { title: newTitle });
      }

      setState(prev => {
        const newSessions = prev.sessions.map(s => 
          s.id === sessionId ? { ...s, title: newTitle } : s
        );
        if (!isTauriEnvironment()) {
          localStorage.setItem('kasset_ai_chat_sessions', JSON.stringify(newSessions));
        }
        return { ...prev, sessions: newSessions };
      });
    } catch (error) {
      console.error('[ChatContext] Error renaming session:', error);
    }
  }, []);

  const copyMessage = useCallback((messageId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setState(prev => ({ ...prev, copiedMessageId: messageId }));
    setTimeout(() => {
      setState(prev => ({ ...prev, copiedMessageId: null }));
    }, 2000);
  }, []);

  const setSessions = useCallback((sessions: ChatSession[]) => {
    setState(prev => ({ ...prev, sessions }));
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

  // Send message
  const sendMessage = useCallback(async (textOverride?: string, historyItems?: HistoryItem[], settings?: AppSettings, providers?: ModelProvider[]) => {
    const textToSend = textOverride || state.input;
    if (!textToSend.trim() || state.isLoading) return;

    const isNewSession = !state.currentSessionId;
    const activeSessionId = state.currentSessionId || Date.now().toString();
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      parts: state.pendingAttachments.length > 0
        ? [{ type: 'text' as const, text: textToSend }, ...state.pendingAttachments]
        : undefined,
      timestamp: Date.now(),
    };

    let newSessions = [...state.sessions];
    let targetSession = newSessions.find(s => s.id === activeSessionId);

    if (!targetSession) {
      targetSession = {
        id: activeSessionId,
        title: textToSend.slice(0, 30),
        lastMessageAt: Date.now(),
        messages: [],
      };
      newSessions.unshift(targetSession);
    }

    // Clear suggestions from previous messages before adding new user message
    targetSession.messages = targetSession.messages.map(msg => {
      if (msg.suggestions && msg.suggestions.length > 0) {
        const { suggestions, ...msgWithoutSuggestions } = msg;
        return msgWithoutSuggestions;
      }
      return msg;
    });

    targetSession.messages.push(userMsg);
    targetSession.lastMessageAt = Date.now();

    // Get the selected meeting references for context
    const selectedRefs = state.selectedMeetingRefs;

    // Update state immediately with user message - ensures it appears in ChatView right away
    // Also clear selected meeting refs and pending attachments after sending
    setState(prev => ({
      ...prev,
      sessions: newSessions,
      currentSessionId: activeSessionId,
      input: '',
      isLoading: true,
      selectedMeetingRefs: [],
      pendingAttachments: [],
    }));

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Persist user message immediately
    await persistSession(targetSession);

    // Resolve model to get provider info early (outside try so catch can reference it)
    const defaultSettings = {
      transcriptionModel: '',
      chatModel: '',
      apiKey: '',
      audioQualityPreset: 'voice' as const
    };
    const effectiveSettings = settings || defaultSettings;
    const effectiveProviders = providers || [];
    const resolved = resolveModel(effectiveSettings.chatModel, effectiveProviders);

    // Create assistant message placeholder with LOADING state BEFORE context
    // pipeline resolves — so the user sees the loading animation immediately,
    // even while the embedding model downloads behind the consent modal.
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

    // Add assistant message with LOADING state to UI immediately
    newSessions = newSessions.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: [...s.messages, assistantMsg],
          lastMessageAt: Date.now(),
        };
      }
      return s;
    });

    setState(prev => ({
      ...prev,
      sessions: newSessions,
    }));

    try {
      // Resolve context via the pipeline (handles @ mentions)
      // Context pipeline still runs for @ mentions regardless of tool support
      const contextBlock = await contextPipeline.resolve({
        userMessage: textToSend,
        conversationMessages: targetSession.messages,
        historyItems: historyItems || [],
        settings: effectiveSettings,
        providers: effectiveProviders,
        manualMeetingRefs: selectedRefs,
        signal: abortControllerRef.current?.signal,
      });
      // contextBlock is threaded into the request config below

      // Initialize external streaming store — only the streaming ChatMessage
      // subscribes to this, so the rest of the UI doesn't re-render during streaming.
      streamingStore.start(assistantMsgId);
      let hasFirstChunk = false;
      let streamStartTime = 0;

      // Build the single ChatRequestConfig — one decision point for prompt + schema.
      const adapterForCheck = resolved ? getAdapter(getProviderType(resolved.provider)) : null;
      const modelInfo = resolved ? modalitiesService.getModelInfo(resolved.provider, resolved.modelId) : null;
      const isFirstMessage = targetSession.messages.filter(m => m.role === 'user').length <= 1;
      const config = buildChatRequest({
        contextBlock: contextBlock || undefined,
        hasTools: !!(resolved && supportsTools(resolved) && adapterForCheck?.chatStreamWithTools),
        meetingCount: (historyItems || []).length,
        isFirstMessage,
        supportsStructuredOutput: modelInfo?.capabilities?.structuredOutput !== false,
      });

      // Structured output extractor — strips JSON wrapper so the store only sees display text.
      const extractor = config.outputSchema ? new JsonStreamExtractor() : null;

      // Shared chunk handler for both paths
      const handleChunk = (chunk: string, metadata?: { isThinking?: boolean; isSearching?: boolean; searchQuery?: string; thinkingContent?: string; webCitations?: WebCitation[]; inlineCitations?: InlineCitationSpan[] }) => {
        if (metadata) {
          // Accumulate web citations (deduplicate by URL)
          if (metadata.webCitations) {
            for (const citation of metadata.webCitations) {
              if (!allWebCitations.some(c => c.url === citation.url)) {
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
          // Extract display text (or pass through if no structured output)
          const displayText = extractor ? extractor.push(chunk) : chunk;

          if (displayText) {
            // Transition from loading → streaming on first content chunk
            if (!hasFirstChunk) {
              hasFirstChunk = true;
              streamStartTime = Date.now();
              setState(prev => ({
                ...prev,
                aiActivity: null,
                sessions: prev.sessions.map(s => {
                  if (s.id !== activeSessionId) return s;
                  return {
                    ...s,
                    messages: s.messages.map(m =>
                      m.id === assistantMsgId
                        ? { ...m, state: 'streaming' as const }
                        : m
                    ),
                  };
                }),
              }));
            }

            streamingStore.push(displayText);
          }
        }
      };

      const handleMediaPart = (part: ChatPart) => {
        if (!hasFirstChunk) {
          hasFirstChunk = true;
          streamStartTime = Date.now();
          setState(prev => ({
            ...prev,
            aiActivity: null,
            sessions: prev.sessions.map(s => {
              if (s.id !== activeSessionId) return s;
              return {
                ...s,
                messages: s.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, state: 'streaming' as const }
                    : m
                ),
              };
            }),
          }));
        }
        streamingStore.pushPart(part);
      };

      // Route: tool-calling path vs clean streaming path
      // Gemini API limitation: googleSearch grounding and functionDeclarations cannot be
      // combined in the same request (multi-tool use is Live API only). When web search is
      // enabled for Gemini, route to chatStream which handles googleSearch grounding natively.
      const isGeminiWebSearch = state.webSearchEnabled && adapterForCheck?.type === 'gemini';
      const useTools = !isGeminiWebSearch && !!(resolved && supportsTools(resolved) && adapterForCheck?.chatStreamWithTools);
      // If adapter doesn't support tool calling, useTools will be false and we fall back to direct stream

      // Accumulate completed tool calls — populated during orchestration, persisted on final message
      const completedToolCalls: Array<{ toolName: string; executionMs: number; resultSummary?: string }> = [];
      // Accumulate citations from search_meetings tool calls (deduplicated by meetingId)
      const allCitations: MeetingCitation[] = [];
      // Accumulate web citations from StreamMetadata (deduplicated by URL)
      const allWebCitations: WebCitation[] = [];
      const allInlineCitations: InlineCitationSpan[] = [];

      let tokenUsageResult: { inputTokens?: number; outputTokens?: number } | undefined;

      // Filter out placeholder/loading messages before sending to provider
      const messagesForProvider = targetSession.messages.filter(
        m => m.state !== 'loading' && m.state !== 'streaming'
      );

      if (useTools) {
        // ── Tool-calling path: orchestrator manages the call→execute→resume cycle ──
        const orchestrateResult = await orchestrate(
          {
            messages: messagesForProvider,
            systemPrompt: config.systemPrompt,
            outputSchema: config.outputSchema,
            contextBlock: contextBlock || undefined,
            settings: effectiveSettings,
            providers: effectiveProviders,
            historyItems: historyItems || [],
            signal: abortControllerRef.current?.signal,
            webSearchEnabled: state.webSearchEnabled,
          },
          {
            onChunk: handleChunk,
            onMediaPart: handleMediaPart,
            onToolActivity: (activity) => {
              if (activity.status === 'done') {
                const resultSummary = activity.result
                  ? (activity.result.content?.slice(0, 120) ?? 'Done')
                  : 'Done';
                completedToolCalls.push({
                  toolName: activity.toolName,
                  executionMs: activity.result?.meta?.executionMs ?? 0,
                  resultSummary,
                });
                // Collect citations from search_meetings, deduplicate by meetingId (keep highest score)
                const newCitations = activity.result?.meta?.citations ?? [];
                for (const citation of newCitations) {
                  const existing = allCitations.findIndex(c => c.meetingId === citation.meetingId);
                  if (existing === -1) {
                    allCitations.push(citation);
                  } else if (citation.score > allCitations[existing].score) {
                    allCitations[existing] = citation;
                  }
                }
                setState(prev => ({
                  ...prev,
                  aiActivity: {
                    isCallingTool: true,
                    toolName: activity.toolName,
                    toolPhase: 'result',
                    toolDetail: resultSummary,
                  },
                }));
              } else {
                setState(prev => ({
                  ...prev,
                  aiActivity: {
                    isCallingTool: true,
                    toolName: activity.toolName,
                    toolPhase: 'executing',
                    toolDetail: activity.label,
                  },
                }));
              }
            },
          }
        );
        tokenUsageResult = orchestrateResult.tokenUsage;
      } else {
        // ── Clean streaming path: direct to adapter, no tools ──
        tokenUsageResult = await unifiedAIService.chatStream({
          messages: messagesForProvider,
          resolved: resolved!,
          systemPrompt: config.systemPrompt,
          outputSchema: config.outputSchema,
          webSearchEnabled: state.webSearchEnabled,
          signal: abortControllerRef.current?.signal,
          onChunk: handleChunk,
          onMediaPart: handleMediaPart,
        });
      }

      // Stream complete — flush store and commit final text + parts to sessions
      const streamResult = streamingStore.finish();
      const streamedParts = streamResult.parts;

      let mainText: string;
      let suggestions: string[] | undefined;
      let generatedTitle: string | undefined;

      if (extractor) {
        // Structured output path — parse the accumulated JSON
        const fullJson = extractor.getFullJson();
        try {
          const parsed = JSON.parse(fullJson);
          mainText = parsed.response;
          suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined;
          generatedTitle = parsed.title || undefined;
        } catch {
          // Incomplete/malformed JSON — use what the extractor already output
          mainText = streamResult.text;
          suggestions = undefined;
        }
      } else {
        // Fallback: delimiter parsing (no structured output)
        const fullText = streamResult.text;
        const textSections = fullText.split('---SUGGESTIONS---');
        mainText = textSections[0].trim();
        suggestions = textSections[1]
          ? textSections[1].split('\n').map(s => s.trim()).filter(s => s && s.length > 2)
          : undefined;
      }

      // Build final parts: replace text content (strip suggestions/JSON) and keep media parts
      const finalParts: ChatPart[] = streamedParts.map(p => {
        if (p.type === 'text') {
          // For structured output, store already has clean text; for delimiter, strip suggestions
          const cleanText = extractor ? p.text : p.text.split('---SUGGESTIONS---')[0].trim();
          return { type: 'text' as const, text: cleanText };
        }
        return p;
      }).filter(p => p.type !== 'text' || (p as Extract<ChatPart, { type: 'text' }>).text.length > 0);

      // Use real token counts from provider, derive speed from wall-clock time
      const tokenCount = tokenUsageResult?.outputTokens;
      const streamDurationSec = streamStartTime > 0 ? (Date.now() - streamStartTime) / 1000 : 0;
      const tokensPerSecond = tokenCount && streamDurationSec > 0.05
        ? Math.round(tokenCount / streamDurationSec)
        : undefined;

      setState(prev => {
        const finalSessions = prev.sessions.map(s => {
          if (s.id !== activeSessionId) return s;
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    text: mainText,
                    parts: finalParts.length > 0 ? finalParts : undefined,
                    suggestions,
                    state: 'complete' as const,
                    tokenCount,
                    tokensPerSecond,
                    ...(completedToolCalls.length > 0 && {
                      toolActivity: {
                        calls: completedToolCalls,
                        totalIterations: completedToolCalls.length,
                        ...(allCitations.length > 0 && { citations: allCitations }),
                      },
                    }),
                    ...(allWebCitations.length > 0 && {
                      webCitations: allWebCitations,
                    }),
                    ...(allInlineCitations.length > 0 && {
                      inlineCitations: allInlineCitations,
                    }),
                  }
                : m
            ),
            lastMessageAt: Date.now(),
          };
        });

        const sessionToPersist = finalSessions.find(s => s.id === activeSessionId);
        if (sessionToPersist) {
          persistSession(sessionToPersist);
        }

        return { ...prev, sessions: finalSessions, isLoading: false, aiActivity: null };
      });

      // Title: use structured output title if available, otherwise generate async
      if (generatedTitle && isNewSession) {
        renameSession(activeSessionId, generatedTitle);
      } else if (isNewSession) {
        unifiedAIService
          .generateTitle(textToSend, mainText, effectiveSettings, effectiveProviders)
          .then(title => {
            renameSession(activeSessionId, title);
          });
      }
    } catch (error: any) {
      console.error('[ChatContext] Error sending message:', error);
      streamingStore.reset();

      // Check if error was due to abort — stopGeneration already handled
      // the message state transition, but ensure it's complete as a safety net
      if (error.name === 'AbortError' || error.message?.includes('abort')) {
        console.log('[ChatContext] Message generation was stopped by user');
        setState(prev => ({
          ...prev,
          sessions: prev.sessions.map(s => {
            if (s.id !== activeSessionId) return s;
            return {
              ...s,
              messages: s.messages.map(m => {
                if (m.id !== assistantMsgId || m.state === 'complete') return m;
                // Show [Stopped] if abort happened before any text was streamed (4.4.8)
                return { ...m, text: m.text || '[Stopped]', state: 'complete' as const };
              }),
            };
          }),
          isLoading: false,
          aiActivity: null,
        }));
        return;
      }

      // Update the existing assistant placeholder with the error instead of
      // creating a duplicate message. The placeholder was already added above.
      setState(prev => {
        const updatedSessions = prev.sessions.map(s => {
          if (s.id !== activeSessionId) return s;
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === assistantMsgId
                ? { ...m, text: `Error: ${error.message || 'Failed to get response'}`, state: 'complete' as const }
                : m
            ),
            lastMessageAt: Date.now(),
          };
        });

        // Persist error state
        const sessionToPersist = updatedSessions.find(s => s.id === activeSessionId);
        if (sessionToPersist) {
          persistSession(sessionToPersist);
        }

        return { ...prev, sessions: updatedSessions, isLoading: false };
      });
    } finally {
      // Clear abort controller
      abortControllerRef.current = null;
    }
  }, [state.input, state.isLoading, state.currentSessionId, state.sessions, state.selectedMeetingRefs, persistSession, state.webSearchEnabled]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      // Capture any partial streaming content instead of discarding
      const streamResult = streamingStore.finish();

      setState(prev => {
        const currentSessionId = prev.currentSessionId;
        return {
          ...prev,
          sessions: prev.sessions.map(s => {
            if (s.id !== currentSessionId) return s;
            return {
              ...s,
              messages: s.messages.map(m => {
                if (m.state !== 'loading' && m.state !== 'streaming') return m;
                // Preserve any partial content that was streamed; fall back to [Stopped]
                const text = streamResult.text || m.text || '[Stopped]';
                const parts = streamResult.parts.length > 0 ? streamResult.parts : m.parts;
                return { ...m, text, parts, state: 'complete' as const };
              }),
            };
          }),
          isLoading: false,
          aiActivity: null,
        };
      });
      console.log('[ChatContext] Stopped generation');
    }
  }, []);

  const rerunLastMessage = useCallback(async (historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => {
    const session = state.sessions.find(s => s.id === state.currentSessionId);
    if (!session || session.messages.length < 2) return;

    // Find last user message (skip the last assistant message)
    const messages = session.messages;
    const lastAssistantIdx = messages.length - 1;
    if (messages[lastAssistantIdx]?.role !== 'model') return;

    // Remove the last assistant message
    const trimmedMessages = messages.slice(0, lastAssistantIdx);
    const lastUserMsg = trimmedMessages[trimmedMessages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    // Update session to remove the assistant message
    setState(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === session.id ? { ...s, messages: trimmedMessages } : s
      ),
    }));

    // Resend the user message text
    await sendMessage(lastUserMsg.text, historyItems, settings, providers);
  }, [state.sessions, state.currentSessionId, sendMessage]);

  const value: ChatContextValue = {
    ...state,
    currentSession,
    filteredSessions,
    setInput,
    setCurrentSessionId,
    setViewHistory,
    setSearchQuery,
    toggleChat,
    openChat,
    closeChat,
    newChat,
    sendMessage,
    loadSessions,
    selectSession,
    deleteSession,
    renameSession,
    stopGeneration,
    copyMessage,
    setSessions,
    setSelectedMeetingRefs,
    toggleWebSearch,
    setDeleteConfirmId,
    rerunLastMessage,
    addAttachment,
    removeAttachment,
    clearAttachments,
    addScreenshotAttachment,
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
