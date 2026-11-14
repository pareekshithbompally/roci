/**
 * HistoryItem Component
 * 
 * Renders a single history item with actions.
 */

import React from 'react';
import { MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { HighlightedText } from '@shared/components';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
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
  isMenuOpen?: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  onClick: () => void;
  onMenuToggle: () => void;
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
  isMenuOpen,
  isRenaming,
  renameValue = '',
  onClick,
  onMenuToggle,
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
        <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { if (open !== !!isMenuOpen) onMenuToggle(); }}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={MoreHorizontal} size="sm" label={`Options for ${title}`} onClick={(e) => e.stopPropagation()} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={onStartRename}>
              <Icon icon={Edit2} size="sm" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onSelect={onDeleteClick}>
              <Icon icon={Trash2} size="sm" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Surface>
  );
};

export default HistoryItem;
