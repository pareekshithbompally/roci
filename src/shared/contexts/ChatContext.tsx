/**
 * Chat Context (Backward-Compat Wrapper)
 *
 * Now delegates to the chatStore (Zustand).
 * ChatProvider is retained for the provider hierarchy — it calls useChatStoreInit
 * to wire up settings/history injection and auto-load/auto-save effects.
 * useChat() returns the same shape as before for backward compatibility.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode, type MutableRefObject } from 'react';
import type { ChatSession, ChatMessage, ChatPart, ChatIndexEntry, AppSettings, HistoryItem, MeetingCitation, WebCitation, InlineCitationSpan } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { useChatStore, injectChatRefs, chatInputRef, useCurrentSession, useFilteredIndexEntries } from '@features/chat/stores/chatStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { chatService } from '@services/chat.service';
import { SIDEBAR_SEARCH_DEBOUNCE_MS, MAX_LOADED_SESSIONS } from '@config/chat.config';

// ── Types (same as before) ──

interface ChatState {
  sessionIndex: ChatIndexEntry[];
  currentSessionId: string | null;
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
}

interface ChatContextValue extends ChatState {
  currentSession: ChatSession | null;
  filteredIndexEntries: ChatIndexEntry[];
  setInput: (input: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setViewHistory: (view: boolean) => void;
  setSearchQuery: (query: string) => void;
  newChat: () => void;
  sendMessage: (text?: string, historyItems?: HistoryItem[], settings?: AppSettings, providers?: ModelProvider[], options?: { regenerate?: boolean }) => Promise<void>;
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  stopGeneration: () => void;
  copyMessage: (messageId: string, text: string) => void;
  setSelectedMeetingRefs: (meetings: MeetingListItem[]) => void;
  toggleWebSearch: () => void;
  setDeleteConfirmId: (id: string | null) => void;
  rerunLastMessage: (historyItems?: HistoryItem[], settings?: AppSettings, providers?: ModelProvider[]) => Promise<void>;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  addScreenshotAttachment: (base64: string, name: string) => void;
  getOrCreateMeetingSession: (meetingId: string, meetingTitle: string) => void;
  loadMoreSessions: () => void;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const { settings, providers } = useSettings();
  const { items: historyItems } = useHistoryData();
  const [initialized, setInitialized] = useState(false);

  // Inject settings/providers/historyItems into the store so sendMessage can read them
  useEffect(() => {
    injectChatRefs({ settings, providers: providers || [], historyItems });
  }, [settings, providers, historyItems]);

  // Debounce search query
  const searchQuery = useChatStore((s) => s.searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      useChatStore.setState({ debouncedSearchQuery: searchQuery });
    }, SIDEBAR_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-load sessions index on mount
  const isInit = useChatStore((s) => s.isInitialized);
  useEffect(() => {
    if (!isInit && !initialized) {
      setInitialized(true);
      const init = async () => {
        await new Promise((r) => setTimeout(r, 100));
        await useChatStore.getState().loadSessions();
        useChatStore.setState({ isInitialized: true });
      };
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save current session when loadedSessions changes (debounced, 500ms)
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const loadedSessions = useChatStore((s) => s.loadedSessions);
  const isStoreInit = useChatStore((s) => s.isInitialized);
  useEffect(() => {
    if (!isStoreInit || !currentSessionId) return;
    const timeoutId = setTimeout(() => {
      const session = useChatStore.getState().loadedSessions.get(currentSessionId);
      if (session) chatService.persistSession(session);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [currentSessionId, loadedSessions, isStoreInit]);

  // Demand-load + normalize stale session states from disk
  useEffect(() => {
    if (!currentSessionId) return;

    const existing = useChatStore.getState().loadedSessions.get(currentSessionId);
    if (existing) {
      // Already in cache — normalize in-place (one-time fix for pre-existing stale sessions)
      const hadStale = existing.messages.some(
        (m) => m.state === 'loading' || m.state === 'streaming'
      );
      if (hadStale) {
        const normalized = {
          ...existing,
          messages: existing.messages.map((m) =>
            m.state === 'loading' || m.state === 'streaming'
              ? { ...m, text: m.text || '[Interrupted]', state: 'complete' as const }
              : m
          ),
        };
        useChatStore.getState().setLoadedSessions((prev) => {
          const next = new Map(prev);
          next.set(currentSessionId, normalized);
          return next;
        });
      }
      return;
    }

    let cancelled = false;
    useChatStore.setState({ isSessionLoading: true });

    chatService
      .loadSession(currentSessionId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) { useChatStore.setState({ isSessionLoading: false }); return; }
        // Normalize any stale message states from interrupted sessions
        const session = {
          ...raw,
          messages: raw.messages.map((m) =>
            m.state === 'loading' || m.state === 'streaming'
              ? { ...m, text: m.text || '[Interrupted]', state: 'complete' as const }
              : m
          ),
        };
        useChatStore.getState().setLoadedSessions((prev) => {
          const next = new Map(prev);
          if (next.size >= MAX_LOADED_SESSIONS) {
            for (const [id] of next) {
              if (id !== currentSessionId) { next.delete(id); break; }
            }
          }
          next.set(currentSessionId, session);
          return next;
        });
        useChatStore.setState({ isSessionLoading: false });
      })
      .catch(() => {
        if (!cancelled) useChatStore.setState({ isSessionLoading: false });
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  // ── Build context value from store (backward compat) ──

  const currentSession = useCurrentSession();
  const filteredIndexEntries = useFilteredIndexEntries();
  const sessionIndex = useChatStore((s) => s.sessionIndex);
  const cId = useChatStore((s) => s.currentSessionId);
  const isSessionLoading = useChatStore((s) => s.isSessionLoading);
  const indexPage = useChatStore((s) => s.indexPage);
  const input = useChatStore((s) => s.input);
  const isLoading = useChatStore((s) => s.isLoading);
  const viewHistory = useChatStore((s) => s.viewHistory);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const debouncedSearchQuery = useChatStore((s) => s.debouncedSearchQuery);
  const copiedMessageId = useChatStore((s) => s.copiedMessageId);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);
  const webSearchEnabled = useChatStore((s) => s.webSearchEnabled);
  const aiActivity = useChatStore((s) => s.aiActivity);
  const deleteConfirmId = useChatStore((s) => s.deleteConfirmId);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);

  const setInput = useCallback((v: string) => useChatStore.setState({ input: v }), []);
  const setCurrentSessionIdFn = useCallback((v: string | null) => {
    useChatStore.getState().setCurrentSessionId(v);
  }, []);
  const setViewHistoryFn = useCallback((v: boolean) => useChatStore.setState({ viewHistory: v }), []);
  const setSearchQueryFn = useCallback((v: string) => useChatStore.setState({ searchQuery: v }), []);
  const newChatFn = useCallback(() => useChatStore.getState().newChat(), []);

  const sendMessageFn = useCallback(async (
    text?: string,
    _historyItems?: HistoryItem[],
    _settings?: AppSettings,
    _providers?: ModelProvider[],
    options?: { regenerate?: boolean }
  ) => {
    await useChatStore.getState().sendMessage(text, options);
  }, []);

  const loadSessionsFn = useCallback(() => useChatStore.getState().loadSessions(), []);
  const selectSessionFn = useCallback((id: string) => useChatStore.getState().selectSession(id), []);
  const deleteSessionFn = useCallback(async (id: string) => useChatStore.getState().deleteSession(id), []);
  const renameSessionFn = useCallback(async (id: string, title: string) => useChatStore.getState().renameSession(id, title), []);
  const stopGenerationFn = useCallback(() => useChatStore.getState().stopGeneration(), []);
  const copyMessageFn = useCallback((id: string, text: string) => useChatStore.getState().copyMessage(id, text), []);
  const setSelectedMeetingRefsFn = useCallback((m: MeetingListItem[]) => useChatStore.getState().setSelectedMeetingRefs(m), []);
  const toggleWebSearchFn = useCallback(() => useChatStore.getState().toggleWebSearch(), []);
  const setDeleteConfirmIdFn = useCallback((id: string | null) => useChatStore.setState({ deleteConfirmId: id }), []);
  const rerunLastMessageFn = useCallback(async () => {
    await useChatStore.getState().rerunLastMessage();
  }, []);
  const addAttachmentFn = useCallback(async (f: File) => useChatStore.getState().addAttachment(f), []);
  const removeAttachmentFn = useCallback((i: number) => useChatStore.getState().removeAttachment(i), []);
  const clearAttachmentsFn = useCallback(() => useChatStore.getState().clearAttachments(), []);
  const addScreenshotAttachmentFn = useCallback((b64: string, name: string) => useChatStore.getState().addScreenshotAttachment(b64, name), []);
  const getOrCreateMeetingSessionFn = useCallback((id: string, title: string) => useChatStore.getState().getOrCreateMeetingSession(id, title), []);
  const loadMoreSessionsFn = useCallback(() => useChatStore.getState().loadMoreSessions(), []);

  const value = useMemo<ChatContextValue>(
    () => ({
      sessionIndex,
      currentSessionId: cId,
      isSessionLoading,
      indexPage,
      input,
      isLoading,
      viewHistory,
      searchQuery: storeSearchQuery,
      debouncedSearchQuery,
      copiedMessageId,
      selectedMeetingRefs,
      webSearchEnabled,
      aiActivity,
      deleteConfirmId,
      pendingAttachments,
      currentSession,
      filteredIndexEntries,
      setInput,
      setCurrentSessionId: setCurrentSessionIdFn,
      setViewHistory: setViewHistoryFn,
      setSearchQuery: setSearchQueryFn,
      newChat: newChatFn,
      sendMessage: sendMessageFn,
      loadSessions: loadSessionsFn,
      selectSession: selectSessionFn,
      deleteSession: deleteSessionFn,
      renameSession: renameSessionFn,
      stopGeneration: stopGenerationFn,
      copyMessage: copyMessageFn,
      setSelectedMeetingRefs: setSelectedMeetingRefsFn,
      toggleWebSearch: toggleWebSearchFn,
      setDeleteConfirmId: setDeleteConfirmIdFn,
      rerunLastMessage: rerunLastMessageFn,
      addAttachment: addAttachmentFn,
      removeAttachment: removeAttachmentFn,
      clearAttachments: clearAttachmentsFn,
      addScreenshotAttachment: addScreenshotAttachmentFn,
      getOrCreateMeetingSession: getOrCreateMeetingSessionFn,
      loadMoreSessions: loadMoreSessionsFn,
      chatInputRef,
    }),
    [
      sessionIndex, cId, isSessionLoading, indexPage, input, isLoading,
      viewHistory, storeSearchQuery, debouncedSearchQuery, copiedMessageId,
      selectedMeetingRefs, webSearchEnabled, aiActivity, deleteConfirmId,
      pendingAttachments, currentSession, filteredIndexEntries,
      setInput, setCurrentSessionIdFn, setViewHistoryFn, setSearchQueryFn,
      newChatFn, sendMessageFn, loadSessionsFn, selectSessionFn,
      deleteSessionFn, renameSessionFn, stopGenerationFn, copyMessageFn,
      setSelectedMeetingRefsFn, toggleWebSearchFn, setDeleteConfirmIdFn,
      rerunLastMessageFn, addAttachmentFn, removeAttachmentFn,
      clearAttachmentsFn, addScreenshotAttachmentFn,
      getOrCreateMeetingSessionFn, loadMoreSessionsFn,
    ]
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = (): ChatContextValue => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export default ChatContext;
