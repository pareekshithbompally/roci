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
import { SURFACE, BORDER, TEXT } from '@config/theme.config';

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
      <div
        className={`flex items-center justify-between p-4 border-b ${BORDER.default} h-14 shrink-0`}
      >
        <h2 className={`font-semibold text-sm ${TEXT.primary} truncate`}>{meetingTitle}</h2>
        <button
          onClick={onClose}
          className={`p-2 ${SURFACE.hoverSubtle} rounded-lg transition-colors shrink-0`}
          title="Close"
        >
          <X className={`w-4 h-4 ${TEXT.muted}`} />
        </button>
      </div>
    ),
    [meetingTitle, onClose]
  );

  return (
    <div
      className={`w-full h-full border-l ${BORDER.default} ${SURFACE.chatPanel} flex flex-col shadow-xl`}
    >
      <ChatShell
        emptyStateMessage="Ask about this meeting..."
        placeholderText="Ask about this meeting..."
        headerSlot={header}
      />
    </div>
  );
};

export default ChatPanel;
