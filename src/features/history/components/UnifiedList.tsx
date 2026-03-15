/**
 * UnifiedList Component
 *
 * Container component that displays a unified list of meetings and chats in the sidebar.
 *
 * Container Philosophy:
 * - Manages all UI state (rename) locally within the container
 * - Item components (UnifiedSidebarItem) are pure presentation components
 * - Type-specific persistence logic is delegated to contexts (HistoryContext, ChatContext)
 * - Dropdown menu state is managed by Radix internally within each item
 */

import React from 'react';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import { TEXT } from '@config/theme.config';
import { useTranscribeRecording } from '@shared/hooks/useTranscribeRecording';
import { UnifiedSidebarItem } from './UnifiedSidebarItem';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@/types';

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

  const [renamingItemId, setRenamingItemId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');

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

  const handleStartRename = (item: UnifiedSidebarItemType) => {
    setRenamingItemId(item.id);
    setRenameValue(item.title);
  };

  const handleRenameChange = (value: string) => {
    setRenameValue(value);
  };

  const handleRenameSubmit = async (item: UnifiedSidebarItemType) => {
    if (!renameValue.trim()) return;

    if (item.type === 'meeting') {
      await history.renameItem(item.id, renameValue);
    } else if (item.type === 'chat') {
      await chat.renameSession(item.id, renameValue);
    }

    setRenamingItemId(null);
    setRenameValue('');
  };

  const handleRenameCancel = () => {
    setRenamingItemId(null);
    setRenameValue('');
  };

  const handleTranscribe = (item: UnifiedSidebarItemType) => {
    if (item.historyItem) {
      transcribe(item.historyItem);
    }
  };

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <UnifiedSidebarItem
          key={`${item.type}-${item.id}`}
          item={item}
          searchQuery={searchQuery}
          isSelected={selectedId === item.id}
          isRenaming={renamingItemId === item.id}
          renameValue={renameValue}
          onClick={() => onSelect(item)}
          onStartRename={() => handleStartRename(item)}
          onRenameChange={handleRenameChange}
          onRenameSubmit={() => handleRenameSubmit(item)}
          onRenameCancel={handleRenameCancel}
          onDeleteClick={() => handleDelete(item)}
          isTranscribing={isTranscribing && transcribingItemId === item.id}
          onTranscribeClick={item.type === 'meeting' ? () => handleTranscribe(item) : undefined}
        />
      ))}
    </div>
  );
};

export default UnifiedList;
