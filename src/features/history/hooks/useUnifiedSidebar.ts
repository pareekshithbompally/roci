/** The sidebar's rows, a page at a time from the store: meetings and chats by time (names and status only). More load as it
 *  scrolls; a change refreshes the loaded pages in place, so the list never jumps back to the top. */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { sidebarQuery, toHistoryItem } from '@shared/query/items';
import type { ItemEntry } from '@services/db';
import type { UnifiedSidebarItem } from '@shared/types';

const toItem = (entry: ItemEntry): UnifiedSidebarItem => {
  if (entry.kind === 'chat') return { id: entry.chat.id, type: 'chat', title: entry.chat.title, timestamp: entry.chat.lastMessageAt };
  const historyItem = toHistoryItem(entry.meeting);
  return { id: historyItem.id, type: 'meeting', title: historyItem.title, timestamp: historyItem.timestamp, historyItem };
};

export interface UnifiedSidebar {
  items: UnifiedSidebarItem[];
  /** The first page is loading. */
  isLoading: boolean;
  /** Older rows are left to load. */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

export const useUnifiedSidebar = (): UnifiedSidebar => {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(sidebarQuery);
  const items = useMemo(() => (data?.pages ?? []).flat().map(toItem), [data]);
  return {
    items,
    isLoading,
    hasMore: hasNextPage,
    loadingMore: isFetchingNextPage,
    loadMore: () => {
      fetchNextPage().catch((error: unknown) => console.error('[Sidebar] Loading older items failed:', error));
    },
  };
};

export default useUnifiedSidebar;
