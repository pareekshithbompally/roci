/**
 * useUnifiedSidebar Hook
 *
 * Merges history items (meetings) and chat sessions into a single
 * unified list sorted by timestamp for the sidebar.
 */

import { useMemo } from 'react';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import type { UnifiedSidebarItem } from '@/types';

interface UseUnifiedSidebarReturn {
  /** Combined and sorted list of meetings and chats */
  items: UnifiedSidebarItem[];
  /** Whether any items are loading */
  isLoading: boolean;
}

export const useUnifiedSidebar = (): UseUnifiedSidebarReturn => {
  const history = useHistory();
  const chat = useChat();

  const unifiedItems = useMemo(() => {
    const items: UnifiedSidebarItem[] = [];

    // Add history items (meetings/recordings) — uses filteredItems to respect category filters
    history.filteredItems.forEach(item => {
      items.push({
        id: item.id,
        type: 'meeting',
        title: item.title,
        timestamp: item.timestamp,
        historyItem: item,
      });
    });

    // Add all chat sessions
    chat.sessions.forEach(session => {
      items.push({
        id: session.id,
        type: 'chat',
        title: session.title,
        timestamp: session.lastMessageAt,
        chatSession: session,
      });
    });

    // Sort by timestamp descending (newest first)
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [history.filteredItems, chat.sessions]);

  return {
    items: unifiedItems,
    isLoading: history.isLoading,
  };
};

export default useUnifiedSidebar;
