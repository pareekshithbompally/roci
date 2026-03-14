/**
 * Chat Context
 *
 * Manages chat sessions, messages, and chat UI state.
 * Integrates stream buffer for smooth text rendering.
 * Uses new chat service (index + session repositories) for persistence.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useRef, useEffect, MutableRefObject } from 'react';
import type { ChatSession, ChatMessage, ChatPart, AppSettings, HistoryItem, MeetingCitation, WebCitation, InlineCitationSpan } from '@/types';
import { fileToBase64 } from '@/utils/fileUtils';
import type { ModelProvider } from '@/types/modelProviders';
import { chatService } from '@/services/chat.service';
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
  /** Current AI activity state (thinking / web search only — tools are now inline parts) */
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

  // Auto-save sessions when they change (debounced)
  useEffect(() => {
    if (!isInitialized) return;

    const timeoutId = setTimeout(() => {
      if (state.sessions.length > 0) {
        if (state.currentSessionId) {
          const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
          if (currentSession) {
            persistSession(currentSession);
          }
        }
      }
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessions, state.currentSessionId, isInitialized]);

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
    try {
      const indexEntries = await chatService.listSessions();
      if (indexEntries.length > 0) {
        const fullSessions = await Promise.all(
          indexEntries.map(entry => chatService.loadSession(entry.id))
        );
        const sessions: ChatSession[] = fullSessions
          .filter((s): s is ChatSession => s !== null);
        setState(prev => ({ ...prev, sessions }));
        console.log('[ChatContext] Loaded', sessions.length, 'sessions');
      }
    } catch (error) {
      console.error('[ChatContext] Error loading sessions:', error);
    }
  }, []);

  // Persist a session
  const persistSession = useCallback(async (session: ChatSession) => {
    await chatService.persistSession(session);
  }, []);

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
      await chatService.deleteSession(sessionId);

      setState(prev => ({
        ...prev,
        sessions: prev.sessions.filter(s => s.id !== sessionId),
        currentSessionId: prev.currentSessionId === sessionId ? null : prev.currentSessionId,
      }));
    } catch (error) {
      console.error('[ChatContext] Error deleting session:', error);
    }
  }, []);

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      await chatService.renameSession(sessionId, newTitle);

      setState(prev => ({
        ...prev,
        sessions: prev.sessions.map(s =>
          s.id === sessionId ? { ...s, title: newTitle } : s
        ),
      }));
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

    // Update state immediately with user message
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

    // Resolve model
    const defaultSettings = {
      transcriptionModel: '',
      chatModel: '',
      apiKey: '',
      audioQualityPreset: 'voice' as const
    };
    const effectiveSettings = settings || defaultSettings;
    const effectiveProviders = providers || [];
    const resolved = resolveModel(effectiveSettings.chatModel, effectiveProviders);

    // Create assistant message placeholder with LOADING state
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
      const contextBlock = await contextPipeline.resolve({
        userMessage: textToSend,
        conversationMessages: targetSession.messages,
        historyItems: historyItems || [],
        settings: effectiveSettings,
        providers: effectiveProviders,
        manualMeetingRefs: selectedRefs,
        signal: abortControllerRef.current?.signal,
      });

      // Initialize external streaming store
      streamingStore.start(assistantMsgId);
      let hasFirstChunk = false;
      let streamStartTime = 0;

      // Build the ChatRequestConfig
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

      // Structured output extractor
      const extractor = config.outputSchema ? new JsonStreamExtractor() : null;

      // Shared chunk handler for both paths
      const handleChunk = (chunk: string, metadata?: { isThinking?: boolean; isSearching?: boolean; searchQuery?: string; thinkingContent?: string; webCitations?: WebCitation[]; inlineCitations?: InlineCitationSpan[] }) => {
        if (metadata) {
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
          const displayText = extractor ? extractor.push(chunk) : chunk;

          if (displayText) {
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
      const isGeminiWebSearch = state.webSearchEnabled && adapterForCheck?.type === 'gemini';
      const useTools = !isGeminiWebSearch && !!(resolved && supportsTools(resolved) && adapterForCheck?.chatStreamWithTools);

      const allCitations: MeetingCitation[] = [];
      const allWebCitations: WebCitation[] = [];
      const allInlineCitations: InlineCitationSpan[] = [];

      let tokenUsageResult: { inputTokens?: number; outputTokens?: number } | undefined;

      // Filter out placeholder/loading messages before sending to provider
      const messagesForProvider = targetSession.messages.filter(
        m => m.state !== 'loading' && m.state !== 'streaming'
      );

      if (useTools) {
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

                // Extract citations
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
      } else {
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
        const fullJson = extractor.getFullJson();
        try {
          const parsed = JSON.parse(fullJson);
          mainText = parsed.response;
          suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined;
          generatedTitle = parsed.title || undefined;
        } catch {
          mainText = streamResult.text;
          suggestions = undefined;
        }
      } else {
        mainText = streamResult.text;
        suggestions = undefined;
      }

      // Build final parts
      const finalParts: ChatPart[] = streamedParts
        .filter(p => p.type !== 'text' || (p as Extract<ChatPart, { type: 'text' }>).text.length > 0);

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
                    ...(allCitations.length > 0 && {
                      meetingCitations: allCitations,
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

      // Title generation
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

      if (error.name === 'AbortError' || error.message?.includes('abort')) {
        setState(prev => ({
          ...prev,
          sessions: prev.sessions.map(s => {
            if (s.id !== activeSessionId) return s;
            return {
              ...s,
              messages: s.messages.map(m => {
                if (m.id !== assistantMsgId || m.state === 'complete') return m;
                return { ...m, text: m.text || '[Stopped]', state: 'complete' as const };
              }),
            };
          }),
          isLoading: false,
          aiActivity: null,
        }));
        return;
      }

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

        const sessionToPersist = updatedSessions.find(s => s.id === activeSessionId);
        if (sessionToPersist) {
          persistSession(sessionToPersist);
        }

        return { ...prev, sessions: updatedSessions, isLoading: false };
      });
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.input, state.isLoading, state.currentSessionId, state.sessions, state.selectedMeetingRefs, persistSession, state.webSearchEnabled]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

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
    }
  }, []);

  const rerunLastMessage = useCallback(async (historyItems?: any[], settings?: AppSettings, providers?: ModelProvider[]) => {
    const session = state.sessions.find(s => s.id === state.currentSessionId);
    if (!session || session.messages.length < 2) return;

    const messages = session.messages;
    const lastAssistantIdx = messages.length - 1;
    if (messages[lastAssistantIdx]?.role !== 'model') return;

    const trimmedMessages = messages.slice(0, lastAssistantIdx);
    const lastUserMsg = trimmedMessages[trimmedMessages.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    setState(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === session.id ? { ...s, messages: trimmedMessages } : s
      ),
    }));

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
