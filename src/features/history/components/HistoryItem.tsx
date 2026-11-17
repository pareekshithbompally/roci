import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { HighlightedText, Menu } from '@shared/components';
import {
  IconButton,
  Input,
  Surface,
  Text,
} from '@shared/ui';

interface HistoryItemProps {
  id: string;
  title: string;
  matchContext?: string;
  matchType?: string;
  searchQuery?: string;
  isSelected?: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  onClick: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDeleteClick: () => void;
}

export const HistoryItem: React.FC<HistoryItemProps> = ({
  id,
  title,
  matchContext,
  matchType,
  searchQuery = '',
  isSelected,
  isRenaming,
  renameValue = '',
  onClick,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDeleteClick,
}) => {
  return (
    <Surface
      variant={isSelected ? 'card' : 'plain'}
      radius="lg"
      interactive={!isSelected}
      className="group relative p-3"
    >
      {/* Main content - clickable */}
      <div onClick={onClick} className="cursor-pointer pr-8">
        {isRenaming ? (
          <Input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <Text as="h4" variant="headline" truncate>
            <HighlightedText text={title} highlight={searchQuery} />
          </Text>
        )}

        {matchContext && (
          <Surface variant="subtle" radius="lg" className="mt-2 p-2">
            <Text variant="caption" tone="faint" className="block mb-0.5 uppercase">
              Match in {matchType}:
            </Text>
            <Text variant="caption" tone="muted" className="line-clamp-2 italic">
              <HighlightedText text={matchContext} highlight={searchQuery} />
            </Text>
          </Surface>
        )}
      </div>

      {/* 3-dots menu button - visible on hover */}
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Menu
          label={`Options for ${title}`}
          trigger={<IconButton icon={MoreHorizontal} size="sm" label={`Options for ${title}`} onClick={(e) => e.stopPropagation()} />}
          items={[
            { type: 'item', label: 'Rename', onSelect: onStartRename },
            { type: 'separator' },
            { type: 'item', label: 'Delete', onSelect: onDeleteClick, destructive: true },
          ]}
        />
      </div>
    </Surface>
  );
};

export default HistoryItem;
