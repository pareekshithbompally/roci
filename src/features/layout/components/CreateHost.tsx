/** The one host for adding things: whatever `startCreate` named, shown the way this platform shows it (the surfaces decide:
 *  a corner panel on a Mac, a new screen on iPhone). A meeting's chat shows only while that meeting is on screen; its note
 *  belongs to the meeting's own notes editor (the meeting screen opens it). Mounted once by the app. */

import React from 'react';
import { endCreate, useCreateFlow } from '@shared/stores/createStore';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { NewTodoForm } from '@features/todos';
import { MeetingChatPopout } from '@features/chat';
import { useMeetingOnScreen } from '@features/layout/hooks/useMeetingOnScreen';
import { UNTITLED_MEETING } from '@config/meetingLive.config';

const MeetingChatHost: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const onScreen = useMeetingOnScreen().meetingId === meetingId;
  const title = useMeetingBrief(meetingId)?.title || UNTITLED_MEETING;
  return onScreen ? <MeetingChatPopout meetingId={meetingId} meetingTitle={title} /> : null;
};

export const CreateHost: React.FC = () => {
  const flow = useCreateFlow();
  if (flow?.kind === 'todo') return <NewTodoForm key={flow.meetingId ?? 'none'} meetingId={flow.meetingId} onClose={endCreate} />;
  if (flow?.kind === 'chat' && flow.meetingId) return <MeetingChatHost meetingId={flow.meetingId} />;
  return null;
};
