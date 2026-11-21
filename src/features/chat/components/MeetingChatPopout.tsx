/** The meeting chat: a floating mini window over the meeting, the same chat as the full view, one click to expand. */

import React, { useCallback, useEffect, useRef } from 'react';
import { ChevronDown, Maximize2, SquarePen } from 'lucide-react';
import { IconButton, Surface, Text } from '@shared/ui';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { UI_CONFIG } from '@config/ui.config';
import { MEETING_CHAT_PLACEHOLDER } from '@config/chat.config';
import { closeMeetingChat, expandMeetingChat, useChatCurrentSessionId, useChatStore } from '@features/chat/stores';
import { ChatShell } from './ChatShell';

interface MeetingChatPopoutProps {
  meetingId: string;
  meetingTitle: string;
}

/** A fresh chat about this meeting each time the window opens (or the meeting changes); New chat starts another. */
function useMeetingDraft(meetingId: string): () => void {
  const meeting = useMeetingBrief(meetingId);
  const meetingRef = useRef(meeting);
  meetingRef.current = meeting;
  const startedFor = useRef<string | null>(null);

  const start = useCallback(() => {
    const m = meetingRef.current;
    if (m) useChatStore.getState().startMeetingChat({ id: m.id, title: m.title, timestamp: m.timestamp });
  }, []);

  // Once per meeting, as soon as its row is read.
  useEffect(() => {
    if (!meeting || startedFor.current === meetingId) return;
    startedFor.current = meetingId;
    start();
  }, [meeting, meetingId, start]);

  return start;
}

const { meetingChat, titlebar } = UI_CONFIG.layout;

/** Bottom-right, `inset` from the window edges; shorter than `maxHeight` only when the window can't fit it below the titlebar. */
const POPOUT_GEOMETRY: React.CSSProperties = {
  right: meetingChat.inset,
  bottom: meetingChat.inset,
  width: meetingChat.popout.width,
  height: `min(${meetingChat.popout.maxHeight}px, calc(100vh - ${titlebar.safeArea + meetingChat.inset}px))`,
};

export const MeetingChatPopout: React.FC<MeetingChatPopoutProps> = ({ meetingId, meetingTitle }) => {
  const startNew = useMeetingDraft(meetingId);
  // A chat exists once its first message is sent; before that the window already is a new chat.
  const hasConversation = useChatCurrentSessionId() !== null;

  const header = (
    <Surface edge="bottom" className="flex items-center gap-1 pl-4 pr-2 h-11 shrink-0">
      <Text as="h2" variant="bodyStrong" truncate className="flex-1">{meetingTitle}</Text>
      {hasConversation && <IconButton icon={SquarePen} label="New chat" size="sm" onClick={startNew} />}
      <IconButton icon={Maximize2} label="Open full chat" size="sm" onClick={expandMeetingChat} />
      <IconButton icon={ChevronDown} label="Minimize" size="sm" onClick={closeMeetingChat} />
    </Surface>
  );

  return (
    <Surface
      variant="floating"
      radius="xl"
      edge="all"
      className="fixed z-floating flex flex-col overflow-hidden animate-content-show"
      style={POPOUT_GEOMETRY}
      role="dialog"
      aria-label={`Chat about ${meetingTitle}`}
    >
      <ChatShell placeholder={MEETING_CHAT_PLACEHOLDER} scopeMeetingId={meetingId} headerSlot={header} />
    </Surface>
  );
};
