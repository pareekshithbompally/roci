/** Selected meeting references as removable chips above the chat input. */

import React from 'react';
import { X, FileAudio } from 'lucide-react';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { Surface, Icon, IconButton, Text } from '@shared/ui';

interface ContextChipsProps {
  meetings: MeetingListItem[];
  onRemove: (id: string) => void;
}

export const ContextChips: React.FC<ContextChipsProps> = ({
  meetings,
  onRemove,
}) => {
  if (meetings.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {meetings.map((meeting) => (
        <Surface
          key={meeting.id}
          variant="inset"
          radius="md"
          className="inline-flex items-center gap-1.5 pl-2 pr-0.5 py-0.5"
        >
          <Icon icon={FileAudio} size="xs" tone="warning" />
          <Text tone="muted" truncate className="max-w-40">
            {meeting.title}
          </Text>
          <IconButton
            icon={X}
            label="Remove from context"
            size="sm"
            onClick={() => onRemove(meeting.id)}
          />
        </Surface>
      ))}
    </div>
  );
};

export default ContextChips;
