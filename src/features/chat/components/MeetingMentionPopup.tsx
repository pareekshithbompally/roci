/**
 * MeetingMentionPopup Component
 *
 * Dropdown popup for selecting meetings when user types "@" in chat input.
 * Shows recent meetings with search functionality and multi-select support.
 * Uses Radix Popover + cmdk Command for accessible search/selection.
 *
 * Must be rendered inside a <Popover> provided by the parent (ChatInput).
 * This component only renders the PopoverContent portion.
 */

import React from 'react';
import { FileAudio, Check } from 'lucide-react';
import type { MeetingListItem } from '@/services/meetingReferenceService';
import {
  PopoverContent,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@shared/ui';

interface MeetingMentionPopupProps {
  meetings: MeetingListItem[];
  selectedIds: string[];
  onSelect: (id: string) => void;
}

// Format timestamp to relative time
function formatTime(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const MeetingMentionPopup: React.FC<MeetingMentionPopupProps> = ({
  meetings,
  selectedIds,
  onSelect,
}) => {
  return (
    <PopoverContent
      side="top"
      sideOffset={8}
      align="start"
      collisionPadding={16}
      className="w-72 p-0 overflow-hidden flex flex-col max-h-[var(--radix-popover-content-available-height)]"
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <Command className="flex-1 min-h-0 bg-transparent rounded-none">
        <CommandInput placeholder="Search meetings..." />
        <CommandList className="flex-1 min-h-0 max-h-80">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-4">
              <FileAudio className="w-5 h-5 text-[var(--text-faint)]" />
              <span>No meetings found</span>
            </div>
          </CommandEmpty>
          {meetings.map((meeting) => (
            <CommandItem
              key={meeting.id}
              value={meeting.title}
              onSelect={() => onSelect(meeting.id)}
            >
              <FileAudio className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{meeting.title}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {formatTime(meeting.timestamp)}
                </div>
              </div>
              {selectedIds.includes(meeting.id) && (
                <Check className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
              )}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </PopoverContent>
  );
};

export default MeetingMentionPopup;
