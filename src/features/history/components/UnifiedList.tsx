import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import { SIDEBAR_PAGE_SIZE } from '@config/chat.config';
import { useTranscribeRecording } from '@shared/hooks/useTranscribeRecording';
import { useMeetingJobs } from '@shared/stores/meetingJobsStore';
import { deriveMeetingPhase } from '@shared/types/meetingPhase';
import { useSentinel } from '@shared/hooks/useSentinel';
import { useDeleteSession } from '@features/history/hooks/useDeleteSession';
import { SidebarShimmer } from '@features/history/components/SidebarShimmer';
import { UnifiedSidebarItem } from './UnifiedSidebarItem';
import { RenameModal } from '@shared/components';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@shared/types';
import { Text } from '@shared/ui';

const LOAD_MORE_COOLDOWN_MS = 300;

interface UnifiedListProps {
  items: UnifiedSidebarItemType[];
  selectedId: string | null;
  onSelect: (item: UnifiedSidebarItemType) => void;
  searchQuery: string;
}

export const UnifiedList: React.FC<UnifiedListProps> = ({
  items,
  selectedId,
  onSelect,
  searchQuery,
}) => {
  const history = useHistory();
  const chat = useChat();
  const { transcribe } = useTranscribeRecording();
  const jobs = useMeetingJobs();
  const deleteSession = useDeleteSession();

  const [renameItem, setRenameItem] = React.useState<UnifiedSidebarItemType | null>(null);
  const [displayCount, setDisplayCount] = useState(SIDEBAR_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset display when the source list changes identity
  useEffect(() => {
    setDisplayCount(SIDEBAR_PAGE_SIZE);
  }, [items]);

  const hasMore = displayCount < items.length;

  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);

    if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    loadMoreTimerRef.current = setTimeout(() => {
      setDisplayCount((prev) => Math.min(prev + SIDEBAR_PAGE_SIZE, items.length));
      setIsLoadingMore(false);
    }, LOAD_MORE_COOLDOWN_MS);
  }, [hasMore, isLoadingMore, items.length]);

  const sentinelRef = useSentinel({
    onIntersect: loadMore,
    enabled: hasMore && !isLoadingMore,
  });

  const displayedItems = items.slice(0, displayCount);

  if (items.length === 0) {
    return (
      <Text as="div" tone="faint" className="flex items-center justify-center h-full">
        {searchQuery ? 'No items match your search' : 'No recordings or chats yet'}
      </Text>
    );
  }

  const handleDelete = (item: UnifiedSidebarItemType) => {
    void deleteSession(item);
  };

  const handleRenameConfirm = async (newTitle: string) => {
    if (!renameItem) return;

    if (renameItem.type === 'meeting') {
      await history.renameItem(renameItem.id, newTitle);
    } else if (renameItem.type === 'chat') {
      await chat.renameSession(renameItem.id, newTitle);
    }
  };

  const handleTranscribe = (item: UnifiedSidebarItemType) => {
    if (item.historyItem) {
      transcribe(item.historyItem);
    }
  };

  return (
    <>
      <div>
        {displayedItems.map((item) => (
          <UnifiedSidebarItem
            key={`${item.type}-${item.id}`}
            item={item}
            searchQuery={searchQuery}
            isSelected={selectedId === item.id}
            onClick={() => onSelect(item)}
            onStartRename={() => setRenameItem(item)}
            onDeleteClick={() => handleDelete(item)}
            phase={item.type === 'meeting' ? deriveMeetingPhase(jobs[item.id], item.historyItem) : undefined}
            onTranscribeClick={item.type === 'meeting' ? () => handleTranscribe(item) : undefined}
          />
        ))}

        {isLoadingMore && hasMore && (
          <SidebarShimmer count={Math.min(SIDEBAR_PAGE_SIZE, items.length - displayCount)} />
        )}

        {hasMore && !isLoadingMore && (
          <div ref={sentinelRef} className="h-1" aria-hidden="true" />
        )}
      </div>

      <RenameModal
        open={renameItem !== null}
        onOpenChange={(open) => { if (!open) setRenameItem(null); }}
        currentTitle={renameItem?.title ?? ''}
        onConfirm={handleRenameConfirm}
      />
    </>
  );
};

export default UnifiedList;
