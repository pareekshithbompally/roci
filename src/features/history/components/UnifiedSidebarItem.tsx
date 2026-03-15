/**
 * UnifiedSidebarItem Component
 *
 * Renders a single item in the unified sidebar list.
 * Shows a waveform icon for meetings and a message icon for chats.
 */

import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical, Edit2, Trash2, AudioWaveform, MessageSquare, Mic, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@shared/ui/dropdown-menu';
import HighlightedText from '@/components/HighlightedText';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT, SURFACE, BORDER, COMPONENT } from '@config/theme.config';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@/types';

interface UnifiedSidebarItemProps {
  item: UnifiedSidebarItemType;
  searchQuery?: string;
  isSelected?: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  isTranscribing?: boolean;
  onClick: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDeleteClick: () => void;
  onTranscribeClick?: () => void;
}

export const UnifiedSidebarItem: React.FC<UnifiedSidebarItemProps> = ({
  item,
  searchQuery = '',
  isSelected,
  isRenaming,
  renameValue = '',
  isTranscribing,
  onClick,
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
      className={`group relative px-2 py-1.5 rounded-md transition-all border cursor-pointer ${COMPONENT.sidebarItemActive} ${
        isSelected
          ? `${COMPONENT.sidebarItemSelected}`
          : `${COMPONENT.sidebarItemDefault}`
      }`}
    >
      {/* Main content */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="relative shrink-0">
          {isTranscribing ? (
            <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />
          ) : (
            <Icon className={`w-3.5 h-3.5 ${isPending ? 'text-amber-500' : TEXT.secondary}`} />
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

      {/* 3-dots menu — Radix portal escapes overflow-hidden */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={`p-1 ${COMPONENT.menuButtonHover} rounded transition-colors outline-none`}
            >
              <MoreVertical className={`w-3.5 h-3.5 ${TEXT.muted}`} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={4}>
            {hasRecording && onTranscribeClick && (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onTranscribeClick();
                  }}
                  className={TYPOGRAPHY_CLASSES.sidebarItem}
                >
                  <Mic className="w-3.5 h-3.5" />
                  {isPending ? 'Transcribe' : 'Re-transcribe'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              className={TYPOGRAPHY_CLASSES.sidebarItem}
            >
              <Edit2 className="w-3.5 h-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick();
              }}
              className={`${TYPOGRAPHY_CLASSES.sidebarItem} ${COMPONENT.dropdownItemDanger}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default UnifiedSidebarItem;
