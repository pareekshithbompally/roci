/** Mount once inside Settings and History: feeds the chat store its settings, and loads the open chat from disk. */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChatSession } from '@shared/types';
import { useChatStore, injectChatRefs, startNewChat } from '@features/chat/stores';
import { useSettings } from '@shared/contexts/SettingsContext';
import { chatService } from '@services/chat.service';
import { retentionService } from '@services/storage/retention.service';
import { queryKeys } from '@shared/query/queryKeys';

/** Memory holds the open chat and the one replying; any other chat is read from disk again when it's opened. */
function onlyOpenAndReplying(prev: Map<string, ChatSession>, openId: string | null, replyingId: string | null): Map<string, ChatSession> {
  const kept = [...prev].filter(([id]) => id === openId || id === replyingId);
  return kept.length === prev.size ? prev : new Map(kept);
}

export function useChatRuntime(): void {
  const { settings, providers } = useSettings();

  // sendMessage reads these outside React.
  useEffect(() => {
    injectChatRefs({ settings, providers: providers || [] });
  }, [settings, providers]);

  // Chats Keep or Delete All removed leave memory, so an open one is never saved back; an open one gives way to a new chat.
  useEffect(() => retentionService.onChatsRemoved((ids) => {
    const chat = useChatStore.getState();
    if (ids.includes(chat.currentSessionId ?? '')) startNewChat();
    chat.forgetSessions(ids);
  }), []);

  // The open chat: read from disk when it isn't in memory. The store is its only cache (gcTime 0),
  // so a chat that left memory is read fresh from disk, never from a stale query copy.
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  useEffect(() => {
    const { replyingSessionId, setLoadedSessions } = useChatStore.getState();
    setLoadedSessions((prev) => onlyOpenAndReplying(prev, currentSessionId, replyingSessionId));
  }, [currentSessionId]);
  const isLoaded = useChatStore((s) => !!s.currentSessionId && s.loadedSessions.has(s.currentSessionId));
  const sessionQuery = useQuery({
    queryKey: queryKeys.chat(currentSessionId ?? 'none'),
    queryFn: () => chatService.loadSession(currentSessionId!),
    enabled: !!currentSessionId && !isLoaded,
    gcTime: 0,
  });

  useEffect(() => {
    const loaded = sessionQuery.data;
    if (!loaded) return;
    useChatStore.getState().setLoadedSessions((prev) => (prev.has(loaded.id) ? prev : new Map(prev).set(loaded.id, loaded)));
  }, [sessionQuery.data]);

  // Loading follows the query; selectSession sets it at once.
  const isFetching = sessionQuery.fetchStatus === 'fetching';
  useEffect(() => {
    useChatStore.setState({ isSessionLoading: !!currentSessionId && !isLoaded && isFetching });
  }, [currentSessionId, isLoaded, isFetching]);
}
