/** "@" meeting picker content with search and multi-select; the parent ChatInput supplies the Popover. */

import React from 'react';
import { FileAudio, Check } from 'lucide-react';
import type { MeetingListItem } from '@services/meetingReferenceService';
import {
  PopoverContent,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  Icon,
  Text,
} from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';
import { calendarDayOffset, formatDayLabel } from '@shared/utils/formatters';

interface MeetingMentionPopupProps {
  meetings: MeetingListItem[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  /** Called when the popover closes — parent uses this to restore focus */
  onClose?: () => void;
}

/** Today, Yesterday, "3 days ago" within the week, else the date. */
function formatTime(timestamp: number) {
  const daysAgo = -calendarDayOffset(timestamp);
  if (daysAgo <= 1) return formatDayLabel(timestamp);
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const MeetingMentionPopup: React.FC<MeetingMentionPopupProps> = ({
  meetings,
  selectedIds,
  onSelect,
  onClose,
}) => {
  return (
    <PopoverContent
      side="top"
      sideOffset={UI_CONFIG.picker.sideOffset}
      align="start"
      collisionPadding={UI_CONFIG.picker.collisionPadding}
      width="lg"
      className="p-0 overflow-hidden flex flex-col max-h-[var(--radix-popover-content-available-height)]"
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      <Command className="flex-1 min-h-0">
        <CommandInput placeholder="Search meetings..." />
        <CommandList className="flex-1 min-h-0 max-h-80">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-4">
              <Icon icon={FileAudio} size="md" tone="faint" />
              <span>No meetings found</span>
            </div>
          </CommandEmpty>
          {meetings.map((meeting) => (
            <CommandItem
              key={meeting.id}
              value={meeting.title}
              onSelect={() => onSelect(meeting.id)}
            >
              <Icon icon={FileAudio} size="sm" tone="faint" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{meeting.title}</div>
                <Text as="div" variant="helper" tone="muted">
                  {formatTime(meeting.timestamp)}
                </Text>
              </div>
              {selectedIds.includes(meeting.id) && (
                <Icon icon={Check} size="sm" tone="muted" className="shrink-0" />
              )}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </PopoverContent>
  );
};

export default MeetingMentionPopup;
