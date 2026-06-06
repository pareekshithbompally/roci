/**
 * HistoryList Component
 * 
 * Displays the history items in a list.
 */

import React from 'react';
import { useHistory } from '@shared/contexts/HistoryContext';
import { TEXT } from '@config/theme.config';
import { HistoryItem } from './HistoryItem';
import type { HistoryItem as HistoryItemType } from '@shared/types';

interface FilteredHistoryItem extends HistoryItemType {
  matchContext?: string;
  matchType?: string;
}

interface HistoryListProps {
  items: FilteredHistoryItem[];
  selectedId: string | null;
  onSelect: (item: HistoryItemType) => void;
  searchQuery: string;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  selectedId,
  onSelect,
  searchQuery,
}) => {
  const history = useHistory();

  if (items.length === 0) {
    return (
      <div className={`text-center py-8 ${TEXT.faint} text-sm`}>
        {searchQuery ? 'No items match your search' : 'No recordings yet'}
      </div>
    );
  }

  return (
    <>
      {items.map((item: FilteredHistoryItem) => (
        <HistoryItem
          key={item.id}
          id={item.id}
          title={item.title}
          matchContext={item.matchContext}
          matchType={item.matchType}
          searchQuery={searchQuery}
          isSelected={selectedId === item.id}
          isMenuOpen={history.menuOpenId === item.id}
          isRenaming={history.renameItemId === item.id}
          renameValue={history.renameValue}
          onClick={() => onSelect(item)}
          onMenuToggle={() => history.setMenuOpenId(history.menuOpenId === item.id ? null : item.id)}
          onStartRename={() => history.startRename(item.id, item.title)}
          onRenameChange={history.setRenameValue}
          onRenameSubmit={() => history.renameItem(item.id, history.renameValue)}
          onRenameCancel={history.cancelRename}
          onDeleteClick={() => history.setDeleteConfirmId(item.id)}
        />
      ))}
    </>
  );
};

export default HistoryList;
