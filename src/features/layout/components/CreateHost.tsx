/** The one host for adding things: whatever `startCreate` named, shown the way this platform shows it (the surfaces decide:
 *  a corner panel on a Mac, a new screen on iPhone). A meeting's chat shows only while that meeting is on screen; its note
 *  belongs to the meeting's own notes editor (the meeting screen opens it). Mounted once by the app. */

import React, { useState } from 'react';
import { endCreate, useCreateFlow, type CreateFlow } from '@shared/stores/createStore';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { NewTodoForm } from '@features/todos';
import { MeetingChatPopout } from '@features/chat';
import { useMeetingOnScreen } from '@features/layout/hooks/useMeetingOnScreen';
import { UNTITLED_MEETING } from '@config/meetingLive.config';

const MeetingChatHost: React.FC<{ open: boolean; meetingId: string }> = ({ open, meetingId }) => {
  const onScreen = useMeetingOnScreen().meetingId === meetingId;
  const title = useMeetingBrief(meetingId)?.title || UNTITLED_MEETING;
  return <MeetingChatPopout open={open && onScreen} meetingId={meetingId} meetingTitle={title} />;
};

/** The last flow started, kept while its surface slides away after it ends. */
function useLastFlow(): { last: CreateFlow | null; open: boolean } {
  const flow = useCreateFlow();
  const [last, setLast] = useState(flow);
  if (flow && flow !== last) setLast(flow);
  return { last, open: flow !== null && flow === last };
}

export const CreateHost: React.FC = () => {
  const { last, open } = useLastFlow();
  if (last?.kind === 'todo') return <NewTodoForm key={last.id} open={open} meetingId={last.meetingId} onClose={endCreate} />;
  if (last?.kind === 'chat' && last.meetingId) return <MeetingChatHost key={last.id} open={open} meetingId={last.meetingId} />;
  return null;
};
