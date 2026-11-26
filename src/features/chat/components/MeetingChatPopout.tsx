/** The meeting chat, the same chat as the full view: on a Mac a panel at the corner its + sits in (one click to expand); on
 *  iPhone a screen of its own with ‹ back. Opened only through `startCreate('chat', meetingId)`. */

import React, { useCallback, useEffect, useRef } from 'react';
import { Maximize2, SquarePen } from 'lucide-react';
import { IconButton, PanelScreen } from '@shared/ui';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { MEETING_CHAT_PLACEHOLDER } from '@config/chat.config';
import { MEETING_ADD_COPY as COPY } from '@config/meetingLive.config';
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

export const MeetingChatPopout: React.FC<MeetingChatPopoutProps> = ({ meetingId, meetingTitle }) => {
  const startNew = useMeetingDraft(meetingId);
  // A chat exists once its first message is sent; before that the window already is a new chat.
  const hasConversation = useChatCurrentSessionId() !== null;
  return (
    <PanelScreen
      title={meetingTitle}
      label={COPY.chatAbout(meetingTitle)}
      onClose={closeMeetingChat}
      actions={hasConversation && <IconButton icon={SquarePen} label={COPY.newChat} size="sm" onClick={startNew} />}
      panelActions={<IconButton icon={Maximize2} label={COPY.openFullChat} size="sm" onClick={expandMeetingChat} />}
    >
      <ChatShell placeholder={MEETING_CHAT_PLACEHOLDER} scopeMeetingId={meetingId} />
    </PanelScreen>
  );
};
