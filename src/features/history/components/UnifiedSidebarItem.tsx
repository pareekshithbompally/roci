/**
 * UnifiedSidebarItem Component
 *
 * Renders a single item in the unified sidebar list (one 32px Row).
 * Meetings show a status icon (waveform / spinner / speaker / pending mic);
 * chats are plain text.
 */

import React, { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, Edit2, Trash2, AudioWaveform, Mic, Loader2, Volume2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, actionRowClasses, RowAction, RowTitle, Icon } from '@shared/ui';
import { HighlightedText } from '@shared/components';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@shared/types';

interface UnifiedSidebarItemProps {
  item: UnifiedSidebarItemType;
  searchQuery?: string;
  isSelected?: boolean;
  isTranscribing?: boolean;
  onClick: () => void;
  onStartRename: () => void;
  onDeleteClick: () => void;
  onTranscribeClick?: () => void;
}

export const UnifiedSidebarItem: React.FC<UnifiedSidebarItemProps> = React.memo(({
  item,
  searchQuery = '',
  isSelected,
  isTranscribing,
  onClick,
  onStartRename,
  onDeleteClick,
  onTranscribeClick,
}) => {
  const isPending = item.historyItem?.pendingTranscription;
  const hasRecording = !!item.historyItem?.recordingFileName;

  const audioSession = useAudioPlayerStore((s) => s.session);
  const audioIsPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const isThisMeetingPlaying =
    item.type === 'meeting' &&
    !!audioSession &&
    audioSession.meetingId === item.historyItem?.id &&
    audioIsPlaying;

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
      data-sidebar-id={`${item.type}-${item.id}`}
      onClick={onClick}
      className={actionRowClasses(isSelected)}
    >
      {item.type === 'meeting' && (
        <div className="relative shrink-0">
          {isTranscribing ? (
            <Icon icon={Loader2} size="xs" tone="ai" className="animate-spin" />
          ) : isThisMeetingPlaying ? (
            <Icon icon={Volume2} size="xs" tone="success" className="animate-pulse" />
          ) : (
            <Icon icon={AudioWaveform} size="xs" tone={isPending ? 'warning' : 'muted'} />
          )}
          {isPending && !isTranscribing && (
            <Icon icon={Mic} size="xs" tone="warning" className="w-2 h-2 absolute -top-0.5 -right-1" />
          )}
        </div>
      )}

      <RowTitle title={item.title} className={isTitleAnimating ? 'animate-title-morph' : undefined}>
        <HighlightedText text={item.title} highlight={searchQuery} />
      </RowTitle>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowAction onClick={(e) => e.stopPropagation()} aria-label={`Options for ${item.title}`}>
            <Icon icon={MoreHorizontal} size="xs" />
          </RowAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" sideOffset={4}>
          {hasRecording && onTranscribeClick && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onTranscribeClick();
                }}
              >
                <Icon icon={Mic} size="sm" />
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
          >
            <Icon icon={Edit2} size="sm" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="danger"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
          >
            <Icon icon={Trash2} size="sm" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

UnifiedSidebarItem.displayName = 'UnifiedSidebarItem';

export default UnifiedSidebarItem;
