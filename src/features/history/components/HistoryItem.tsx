/**
 * HistoryItem Component
 * 
 * Renders a single history item with actions.
 */

import React from 'react';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';
import HighlightedText from '@shared/components/HighlightedText';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';

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
    <div
      className={`group relative p-3 rounded-xl transition-all border ${
        isSelected
          ? `${SURFACE.card} ${BORDER.strong} shadow-sm`
          : `border-transparent ${SURFACE.hoverSubtle}`
      }`}
    >
      {/* Main content - clickable */}
      <div onClick={onClick} className="cursor-pointer pr-8">
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full text-sm font-semibold ${TEXT.primary} ${SURFACE.inputField} border ${BORDER.strong} rounded-lg px-2 py-1 outline-none`}
            autoFocus
          />
        ) : (
          <h4 className={`text-sm font-semibold truncate ${TEXT.primary}`}>
            <HighlightedText text={title} highlight={searchQuery} />
          </h4>
        )}
        
        {matchContext && (
          <div className={`mt-2 text-xs ${TEXT.muted} bg-amber-50 dark:bg-yellow-900/10 p-2 rounded-xl border border-amber-100 dark:border-yellow-900/30`}>
            <span className={`text-[9px] uppercase font-semibold opacity-60 block mb-0.5 ${TEXT.faint}`}>
              Match in {matchType}:
            </span>
            <span className="line-clamp-2 italic text-[11px] opacity-80">
              <HighlightedText text={matchContext} highlight={searchQuery} />
            </span>
          </div>
        )}
      </div>

      {/* 3-dots menu button - visible on hover */}
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle();
          }}
          className={`p-1.5 ${COMPONENT.menuButtonHover} rounded-lg transition-colors`}
        >
          <MoreVertical className={`w-4 h-4 ${TEXT.muted} rotate-90`} />
        </button>

        {/* Dropdown menu */}
        {isMenuOpen && (
          <div className={`absolute right-0 mt-1 w-40 ${SURFACE.dropdown} border ${BORDER.strong} rounded-lg shadow-lg z-50`}>
            {/* Rename option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              className={`w-full text-left px-4 py-2 text-sm ${TEXT.secondary} ${SURFACE.hoverSubtle} flex items-center gap-2 rounded-t-lg transition-colors`}
            >
              <Edit2 className="w-4 h-4" />
              Rename
            </button>

            {/* Divider */}
            <div className={`h-px ${SURFACE.divider}`} />

            {/* Delete option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick();
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 rounded-b-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryItem;
