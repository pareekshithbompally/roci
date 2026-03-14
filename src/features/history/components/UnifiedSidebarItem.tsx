/**
 * UnifiedSidebarItem Component
 *
 * Renders a single item in the unified sidebar list.
 * Shows a waveform icon for meetings and a message icon for chats.
 */

import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical, Edit2, Trash2, AudioWaveform, MessageSquare, Mic, Loader2 } from 'lucide-react';
import HighlightedText from '@/components/HighlightedText';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@/types';

interface UnifiedSidebarItemProps {
  item: UnifiedSidebarItemType;
  searchQuery?: string;
  isSelected?: boolean;
  isMenuOpen?: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  isTranscribing?: boolean;
  onClick: () => void;
  onMenuToggle: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDeleteClick: () => void;
  onTranscribeClick?: () => void;
}

const DropdownDivider: React.FC = () => (
  <div className={`h-px ${SURFACE.divider}`} />
);

function menuItemClasses(variant: 'default' | 'danger'): string {
  const base = `${COMPONENT.dropdownMenuItemBase} ${TYPOGRAPHY_CLASSES.sidebarItem}`;
  if (variant === 'danger') {
    return `${base} ${TEXT.error} hover:bg-red-50 dark:hover:bg-red-900/20`;
  }
  return `${base} ${TEXT.primary} ${COMPONENT.dropdownItemHover}`;
}

export const UnifiedSidebarItem: React.FC<UnifiedSidebarItemProps> = ({
  item,
  searchQuery = '',
  isSelected,
  isMenuOpen,
  isRenaming,
  renameValue = '',
  isTranscribing,
  onClick,
  onMenuToggle,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDeleteClick,
  onTranscribeClick,
}) => {
  const isPending = item.historyItem?.pendingTranscription;
  const hasRecording = !!item.historyItem?.recordingFileName;
  const Icon = item.type === 'meeting' ? AudioWaveform : MessageSquare;

  // Animate title when it changes (e.g. AI-generated title replaces placeholder)
  const prevTitleRef = useRef(item.title);
  const [isTitleAnimating, setIsTitleAnimating] = useState(false);

  useEffect(() => {
    if (prevTitleRef.current !== item.title && item.type === 'chat') {
      setIsTitleAnimating(true);
      prevTitleRef.current = item.title;
      const timer = setTimeout(() => setIsTitleAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [item.title, item.type]);

  return (
    <div
      onClick={onClick}
      className={`group relative px-2.5 py-2 rounded-lg transition-all border cursor-pointer ${COMPONENT.sidebarItemActive} ${
        isSelected
          ? `${COMPONENT.sidebarItemSelected}`
          : `${COMPONENT.sidebarItemDefault}`
      }`}
    >
      {/* Main content */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative shrink-0">
          {isTranscribing ? (
            <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />
          ) : (
            <Icon className={`w-3.5 h-3.5 ${isPending ? 'text-amber-500' : TEXT.faint}`} />
          )}
          {isPending && !isTranscribing && (
            <Mic className="w-2 h-2 text-amber-500 absolute -top-0.5 -right-1" />
          )}
        </div>

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
            className={`flex-1 ${TYPOGRAPHY_CLASSES.sidebarItem} ${TEXT.primary} ${SURFACE.inputField} border ${BORDER.strong} rounded px-2 py-0.5 outline-none`}
            autoFocus
          />
        ) : (
          <span
            title={item.title}
            className={`flex-1 ${TYPOGRAPHY_CLASSES.sidebarItem} truncate ${TEXT.primary} ${isTitleAnimating ? 'animate-title-morph' : ''}`}
          >
            <HighlightedText text={item.title} highlight={searchQuery} />
          </span>
        )}
      </div>

      {item.matchContext && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`mt-2 ml-5 ${TYPOGRAPHY_CLASSES.sidebarMetadata} ${TEXT.muted} ${SURFACE.matchCallout} px-2 py-1.5 rounded-md border ${BORDER.matchCallout}`}
        >
          <span className={`text-[10px] uppercase font-semibold opacity-60 block mb-0.5 ${TEXT.faint}`}>
            Match in {item.matchType}:
          </span>
          <span className={`line-clamp-2 italic ${TYPOGRAPHY_CLASSES.sidebarMetadata} opacity-75`}>
            <HighlightedText text={item.matchContext} highlight={searchQuery} />
          </span>
        </div>
      )}

      {/* 3-dots menu button - visible on hover, overlays text */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle();
          }}
          className={`p-1 ${COMPONENT.menuButtonHover} rounded transition-colors`}
        >
          <MoreVertical className={`w-3.5 h-3.5 ${TEXT.muted}`} />
        </button>

        {/* Dropdown menu */}
        {isMenuOpen && (
          <div className={`animate-dropdown-in absolute right-0 mt-1 w-36 ${SURFACE.dropdown} border ${BORDER.strong} rounded-lg shadow-lg z-50 overflow-hidden`}>
            {/* Transcribe option - for meetings with recordings */}
            {hasRecording && onTranscribeClick && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTranscribeClick();
                  }}
                  className={menuItemClasses('default')}
                >
                  <Mic className="w-3.5 h-3.5" />
                  {isPending ? 'Transcribe' : 'Re-transcribe'}
                </button>
                <DropdownDivider />
              </>
            )}

            {/* Rename option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              className={menuItemClasses('default')}
            >
              <Edit2 className="w-3.5 h-3.5" />
              Rename
            </button>

            <DropdownDivider />

            {/* Delete option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick();
              }}
              className={menuItemClasses('danger')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedSidebarItem;
