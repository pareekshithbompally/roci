/** Meetings and chat sessions merged into one timestamp-sorted sidebar list. */

import { useMemo } from 'react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useChatIndex } from '@features/chat';
import type { UnifiedSidebarItem } from '@shared/types';

interface UseUnifiedSidebarReturn {
  /** Combined and sorted list of meetings and chats */
  items: UnifiedSidebarItem[];
  /** Whether any items are loading */
  isLoading: boolean;
}

export const useUnifiedSidebar = (): UseUnifiedSidebarReturn => {
  const history = useHistoryData();
  const sessionIndex = useChatIndex();

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

    // Add chat sessions from index — skip entries with no messages
    sessionIndex.forEach(entry => {
      if (entry.messageCount === 0) return;
      items.push({
        id: entry.id,
        type: 'chat',
        title: entry.title,
        timestamp: entry.lastMessageAt,
      });
    });

    // Sort by timestamp descending (newest first)
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [history.filteredItems, sessionIndex]);

  return {
    items: unifiedItems,
    isLoading: history.isLoading,
  };
};

export default useUnifiedSidebar;
