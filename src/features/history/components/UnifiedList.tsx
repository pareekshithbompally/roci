/**
 * UnifiedList Component
 * 
 * Container component that displays a unified list of meetings and chats in the sidebar.
 * 
 * Container Philosophy:
 * - Manages all UI state (menu, rename) locally within the container
 * - Item components (UnifiedSidebarItem) are pure presentation components
 * - Type-specific persistence logic is delegated to contexts (HistoryContext, ChatContext)
 * - This approach allows easy extension for future item types without duplicating UI logic
 */

import React, { useRef, useCallback } from 'react';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import { TEXT } from '@config/theme.config';
import { useTranscribeRecording } from '@shared/hooks/useTranscribeRecording';
import { useClickOutside } from '@shared/hooks';
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

  const listRef = useRef<HTMLDivElement>(null);

  // Container manages all UI state for both meetings and chats
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null);
  const [renamingItemId, setRenamingItemId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');

  const closeMenu = useCallback(() => setMenuOpenId(null), []);
  useClickOutside(listRef, closeMenu, menuOpenId !== null);

  if (items.length === 0) {
    return (
      <div className={`text-center py-8 ${TEXT.faint} text-sm`}>
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
    setMenuOpenId(null);
  };

  const handleStartRename = (item: UnifiedSidebarItemType) => {
    setRenamingItemId(item.id);
    setRenameValue(item.title);
    setMenuOpenId(null);
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
      setMenuOpenId(null);
      transcribe(item.historyItem);
    }
  };

  return (
    <div ref={listRef} className="space-y-1">
      {items.map((item) => (
        <UnifiedSidebarItem
          key={`${item.type}-${item.id}`}
          item={item}
          searchQuery={searchQuery}
          isSelected={selectedId === item.id}
          isMenuOpen={menuOpenId === item.id}
          isRenaming={renamingItemId === item.id}
          renameValue={renameValue}
          onClick={() => onSelect(item)}
          onMenuToggle={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
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
