/**
 * ContextChips Component
 * 
 * Displays selected meeting references as removable chips above the chat input.
 */

import React from 'react';
import { X, FileAudio } from 'lucide-react';
import type { MeetingListItem } from '@services/meetingReferenceService';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';

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
        <div
          key={meeting.id}
          className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 ${SURFACE.selected} border ${BORDER.input} rounded-lg text-sm group ${BORDER.cardHover} transition-colors`}
        >
          <FileAudio className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className={`${TEXT.secondary} max-w-[150px] truncate`}>
            {meeting.title}
          </span>
          <button
            onClick={() => onRemove(meeting.id)}
            className={`p-0.5 ${COMPONENT.menuButtonHover} rounded transition-colors ml-0.5`}
            title="Remove from context"
          >
            <X className={`w-3.5 h-3.5 ${TEXT.faint} hover:text-paper-800 dark:hover:text-night-300`} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ContextChips;
