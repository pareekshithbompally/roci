/** One sidebar row: meetings show their phase via MeetingStatus (or a speaker while playing); chats are text. */

import React, { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, Edit2, Trash2, Mic, Volume2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, actionRowClasses, RowAction, RowTitle, Icon } from '@shared/ui';
import { HighlightedText, MeetingStatus } from '@shared/components';
import { meetingPhaseAction } from '@config/meetingPhase.config';
import type { MeetingPhase } from '@shared/types/meetingPhase';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import type { UnifiedSidebarItem as UnifiedSidebarItemType } from '@shared/types';

interface UnifiedSidebarItemProps {
  item: UnifiedSidebarItemType;
  searchQuery?: string;
  isSelected?: boolean;
  /** Meetings only. */
  phase?: MeetingPhase;
  onClick: () => void;
  onStartRename: () => void;
  onDeleteClick: () => void;
  onTranscribeClick?: () => void;
}

export const UnifiedSidebarItem: React.FC<UnifiedSidebarItemProps> = React.memo(({
  item,
  searchQuery = '',
  isSelected,
  phase,
  onClick,
  onStartRename,
  onDeleteClick,
  onTranscribeClick,
}) => {
  const hasRecording = !!item.historyItem?.recordingFileName;
  const transcribeAction = phase ? meetingPhaseAction(phase) : null;

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
      {item.type === 'meeting' && phase && (
        isThisMeetingPlaying
          ? <Icon icon={Volume2} size="xs" tone="success" className="shrink-0 animate-pulse" />
          : <MeetingStatus phase={phase} display="icon" />
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
          {hasRecording && onTranscribeClick && transcribeAction && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onTranscribeClick();
                }}
              >
                <Icon icon={Mic} size="sm" />
                {transcribeAction}
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
