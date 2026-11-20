/** Mount once inside Settings and History: feeds the chat store its settings, and loads the open chat from disk. */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChatSession } from '@shared/types';
import { useChatStore, injectChatRefs } from '@features/chat/stores';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { chatService } from '@services/chat.service';
import { retentionService } from '@services/storage/retention.service';
import { queryKeys } from '@shared/query/queryKeys';
import { MAX_LOADED_SESSIONS } from '@config/chat.config';

/** Adds a loaded chat to the bounded map; when full, the first-loaded chat that isn't replying makes room. */
function withLoaded(prev: Map<string, ChatSession>, session: ChatSession, replyingId: string | null): Map<string, ChatSession> {
  if (prev.has(session.id)) return prev;
  const next = new Map(prev);
  if (next.size >= MAX_LOADED_SESSIONS) {
    const evict = [...next.keys()].find((id) => id !== replyingId);
    if (evict) next.delete(evict);
  }
  return next.set(session.id, session);
}

export function useChatRuntime(): void {
  const { settings, providers } = useSettings();
  const { items: historyItems } = useHistoryData();

  // sendMessage reads these outside React.
  useEffect(() => {
    injectChatRefs({ settings, providers: providers || [], historyItems });
  }, [settings, providers, historyItems]);

  // Chats Keep or Delete All removed leave memory, so an open one is never saved back.
  useEffect(() => retentionService.onChatsRemoved((ids) => useChatStore.getState().forgetSessions(ids)), []);

  // The open chat: read from disk when it isn't in memory. The store is its only cache (gcTime 0),
  // so a chat that left memory is read fresh from disk, never from a stale query copy.
  const currentSessionId = useChatStore((s) => s.currentSessionId);
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
    const { replyingSessionId, setLoadedSessions } = useChatStore.getState();
    setLoadedSessions((prev) => withLoaded(prev, loaded, replyingSessionId));
  }, [sessionQuery.data]);

  // Loading follows the query; selectSession sets it at once.
  const isFetching = sessionQuery.fetchStatus === 'fetching';
  useEffect(() => {
    useChatStore.setState({ isSessionLoading: !!currentSessionId && !isLoaded && isFetching });
  }, [currentSessionId, isLoaded, isFetching]);
}
