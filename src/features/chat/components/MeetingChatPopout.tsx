/** The meeting chat: a floating mini window over the meeting, the same chat as the full view, one click to expand. */

import React, { useEffect, useRef } from 'react';
import { ChevronDown, Maximize2, SquarePen } from 'lucide-react';
import { cn, IconButton, Surface, Text } from '@shared/ui';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { LAYOUT } from '@config/layout.config';
import { UI_CONFIG } from '@config/ui.config';
import { closeMeetingChat, expandMeetingChat, useChatStore } from '@features/chat/stores/chatStore';
import { ChatShell } from './ChatShell';

interface MeetingChatPopoutProps {
  meetingId: string;
  meetingTitle: string;
}

/** A fresh chat about this meeting each time the window opens (or the meeting changes); New chat starts another. */
function useMeetingDraft(meetingId: string): () => void {
  const { items } = useHistoryData();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const start = useRef(() => {
    const meeting = meetingReferenceService
      .getRecentMeetings(itemsRef.current, itemsRef.current.length)
      .find((m) => m.id === meetingId);
    if (meeting) useChatStore.getState().startMeetingChat(meeting);
  });

  useEffect(() => {
    start.current = () => {
      const meeting = meetingReferenceService
        .getRecentMeetings(itemsRef.current, itemsRef.current.length)
        .find((m) => m.id === meetingId);
      if (meeting) useChatStore.getState().startMeetingChat(meeting);
    };
    start.current();
  }, [meetingId]);

  return () => start.current();
}

export const MeetingChatPopout: React.FC<MeetingChatPopoutProps> = ({ meetingId, meetingTitle }) => {
  const startNew = useMeetingDraft(meetingId);

  const header = (
    <Surface edge="bottom" className="flex items-center gap-1 pl-4 pr-2 h-11 shrink-0">
      <Text as="h2" variant="bodyStrong" truncate className="flex-1">{meetingTitle}</Text>
      <IconButton icon={SquarePen} label="New chat" size="sm" onClick={startNew} />
      <IconButton icon={Maximize2} label="Open full chat" size="sm" onClick={expandMeetingChat} />
      <IconButton icon={ChevronDown} label="Minimize" size="sm" onClick={closeMeetingChat} />
    </Surface>
  );

  return (
    <Surface
      variant="floating"
      radius="xl"
      edge="all"
      className={cn(LAYOUT.chatPopout, 'flex flex-col overflow-hidden animate-content-show')}
      style={{ zIndex: UI_CONFIG.zIndex.overlay }}
      role="dialog"
      aria-label={`Chat about ${meetingTitle}`}
    >
      <ChatShell
        emptyStateMessage="Ask about this meeting..."
        placeholderText="Ask about this meeting..."
        headerSlot={header}
      />
    </Surface>
  );
};
