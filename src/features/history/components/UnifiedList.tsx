import React from 'react';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import { TEXT } from '@config/theme.config';
import { useTranscribeRecording } from '@shared/hooks/useTranscribeRecording';
import { UnifiedSidebarItem } from './UnifiedSidebarItem';
import { RenameModal } from './RenameModal';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@shared/types';

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
  const { transcribe, isTranscribing, transcribingItemId } = useTranscribeRecording();

  const [renameItem, setRenameItem] = React.useState<UnifiedSidebarItemType | null>(null);

  if (items.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${TEXT.faint} text-sm`}>
        {searchQuery ? 'No items match your search' : 'No recordings or chats yet'}
      </div>
    );
  }

  const handleDelete = async (item: UnifiedSidebarItemType) => {
    if (item.type === 'meeting') {
      history.setDeleteConfirmId(item.id);
    } else if (item.type === 'chat') {
      chat.setDeleteConfirmId(item.id);
    }
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
      <div className="space-y-1">
        {items.map((item) => (
          <UnifiedSidebarItem
            key={`${item.type}-${item.id}`}
            item={item}
            searchQuery={searchQuery}
            isSelected={selectedId === item.id}
            onClick={() => onSelect(item)}
            onStartRename={() => setRenameItem(item)}
            onDeleteClick={() => handleDelete(item)}
            isTranscribing={isTranscribing && transcribingItemId === item.id}
            onTranscribeClick={item.type === 'meeting' ? () => handleTranscribe(item) : undefined}
          />
        ))}
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
