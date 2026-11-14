/**
 * ChatPanel Component
 *
 * Meeting-scoped chat panel. Thin wrapper around ChatShell with a header bar.
 * Auto-attaches the viewed meeting as @ context on mount.
 */

import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { ChatShell } from './ChatShell';
import { useChatStore } from '@features/chat/stores';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { Surface, Text, IconButton } from '@shared/ui';

interface ChatPanelProps {
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ meetingId, meetingTitle, onClose }) => {
  const { items: historyItems } = useHistoryData();

  // On mount or meeting change: get or create a session for this meeting.
  useEffect(() => {
    useChatStore.getState().getOrCreateMeetingSession(meetingId, meetingTitle);
  }, [meetingId, meetingTitle]);

  // Attach the meeting as @ context once the history index has it.
  // Keyed on historyItems so a late-loading index still resolves the ref.
  useEffect(() => {
    const meetingRef = meetingReferenceService
      .getRecentMeetings(historyItems, 50)
      .find((m) => m.id === meetingId);
    if (meetingRef) {
      useChatStore.getState().setSelectedMeetingRefs([meetingRef]);
    }
  }, [meetingId, historyItems]);

  const header = useMemo(
    () => (
      <Surface edge="bottom" className="flex items-center justify-between p-4 h-14 shrink-0">
        <Text as="h2" variant="headline" truncate>{meetingTitle}</Text>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="shrink-0" />
      </Surface>
    ),
    [meetingTitle, onClose]
  );

  return (
    <Surface variant="panel" edge="left" className="w-full h-full flex flex-col">
      <ChatShell
        emptyStateMessage="Ask about this meeting..."
        placeholderText="Ask about this meeting..."
        headerSlot={header}
      />
    </Surface>
  );
};

export default ChatPanel;
