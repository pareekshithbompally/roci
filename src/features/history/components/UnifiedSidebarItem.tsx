/** One sidebar row: meetings show their phase via MeetingStatus (or a speaker while playing); chats are text. */

import React from 'react';
import { MoreHorizontal, Volume2 } from 'lucide-react';
import { actionRowClasses, RowAction, RowTitle, Icon } from '@shared/ui';
import { HighlightedText, MeetingStatus, Menu } from '@shared/components';
import { MEETING_PHASE_ACTION_SYMBOL, meetingPhaseAction } from '@config/meetingPhase.config';
import { MENU_SYMBOLS } from '@config/ui.config';
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

  const audioSessionId = useAudioPlayerStore((s) => s.session?.id);
  const audioIsPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const isThisMeetingPlaying =
    item.type === 'meeting' &&
    !!audioSessionId &&
    audioSessionId === item.historyItem?.id &&
    audioIsPlaying;

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

      <RowTitle title={item.title}>
        <HighlightedText text={item.title} highlight={searchQuery} />
      </RowTitle>

      <Menu
        label={`Options for ${item.title}`}
        align="start"
        trigger={(
          <RowAction onClick={(e) => e.stopPropagation()} aria-label={`Options for ${item.title}`}>
            <Icon icon={MoreHorizontal} size="xs" />
          </RowAction>
        )}
        items={[
          ...(hasRecording && onTranscribeClick && transcribeAction
            ? [{ type: 'item' as const, label: transcribeAction, symbol: MEETING_PHASE_ACTION_SYMBOL[transcribeAction], onSelect: onTranscribeClick }, { type: 'separator' as const }]
            : []),
          { type: 'item', label: 'Rename', symbol: MENU_SYMBOLS.rename, onSelect: onStartRename },
          { type: 'item', label: 'Delete', symbol: MENU_SYMBOLS.delete, onSelect: onDeleteClick, destructive: true },
        ]}
      />
    </div>
  );
});

UnifiedSidebarItem.displayName = 'UnifiedSidebarItem';

export default UnifiedSidebarItem;
