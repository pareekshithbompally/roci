import React from 'react';
import { useMeetingMutations } from '@shared/hooks/useMeetings';
import { useChatStore } from '@features/chat';
import { meetingPipeline } from '@features/recording';
import { useMeetingParts } from '@shared/stores/meetingProgressStore';
import { deriveMeetingPhase } from '@shared/types/meetingPhase';
import { meetingPhaseActionReady } from '@config/meetingPhase.config';
import { useAIReadiness } from '@features/settings';
import { useSentinel } from '@shared/hooks/useSentinel';
import { useDeleteSession } from '@features/history/hooks/useDeleteSession';
import { SidebarShimmer } from '@features/history/components/SidebarShimmer';
import { SIDEBAR_SHIMMER_ROWS } from '@config/chat.config';
import { UnifiedSidebarItem } from './UnifiedSidebarItem';
import { EmptyState, RenameModal } from '@shared/components';
import { History, SearchX } from 'lucide-react';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@shared/types';

/** The paged recents list: more rows load as its end scrolls into view. Search results come whole and have none. */
export interface UnifiedListPaging {
  /** The first page is loading: placeholder rows, not the empty message. */
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

interface UnifiedListProps {
  items: UnifiedSidebarItemType[];
  selectedId: string | null;
  onSelect: (item: UnifiedSidebarItemType) => void;
  searchQuery: string;
  paging?: UnifiedListPaging;
}

export const UnifiedList: React.FC<UnifiedListProps> = ({
  items,
  selectedId,
  onSelect,
  searchQuery,
  paging,
}) => {
  const { renameMeeting } = useMeetingMutations();
  const renameSession = useChatStore((s) => s.renameSession);
  const parts = useMeetingParts();
  const deleteSession = useDeleteSession();
  // Once for the list: a meeting offers Transcribe / Summarize only when the AI it needs is set up.
  const aiReady = useAIReadiness();

  const [renameItem, setRenameItem] = React.useState<UnifiedSidebarItemType | null>(null);
  const canLoadMore = !!paging?.hasMore && !paging.loadingMore;
  const sentinelRef = useSentinel({ onIntersect: () => paging?.loadMore(), enabled: canLoadMore });

  if (paging?.loading) return <SidebarShimmer count={SIDEBAR_SHIMMER_ROWS} />;

  if (items.length === 0) {
    return searchQuery
      ? <EmptyState icon={SearchX} message="No items match your search" />
      : <EmptyState icon={History} message="No recordings or chats yet" />;
  }

  const handleDelete = (item: UnifiedSidebarItemType) => {
    void deleteSession(item);
  };

  const handleRenameConfirm = async (newTitle: string) => {
    if (!renameItem) return;

    if (renameItem.type === 'meeting') {
      await renameMeeting(renameItem.id, newTitle);
    } else if (renameItem.type === 'chat') {
      await renameSession(renameItem.id, newTitle);
    }
  };

  const handleTranscribe = (item: UnifiedSidebarItemType) => {
    if (item.historyItem) meetingPipeline.toggle(item.historyItem.id);
  };

  return (
    <>
      <div>
        {items.map((item) => {
          const phase = item.type === 'meeting' ? deriveMeetingPhase(item.historyItem?.status, parts[item.id] ?? null) : undefined;
          return (
            <UnifiedSidebarItem
              key={`${item.type}-${item.id}`}
              item={item}
              searchQuery={searchQuery}
              isSelected={selectedId === item.id}
              onClick={() => onSelect(item)}
              onStartRename={() => setRenameItem(item)}
              onDeleteClick={() => handleDelete(item)}
              phase={phase}
              onTranscribeClick={phase && meetingPhaseActionReady(phase, aiReady) ? () => handleTranscribe(item) : undefined}
            />
          );
        })}

        {paging?.loadingMore && <SidebarShimmer count={SIDEBAR_SHIMMER_ROWS} />}

        {canLoadMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
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
