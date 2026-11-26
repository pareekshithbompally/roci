/** A meeting's one + at the corner: Chat, To-do and Note once it has a page of its own; while it records, only its chat
 *  (the notes are already on the record screen). Every action goes through `startCreate`; hidden while one of this
 *  meeting's is open (its panel takes the corner). */

import React from 'react';
import { ListTodo, NotebookPen } from 'lucide-react';
import { ActionFab, RociMark } from '@shared/ui';
import type { FabAction } from '@shared/ui';
import { startCreate, useCreateFlow } from '@shared/stores/createStore';
import { useMeetingOnScreen } from '@features/layout/hooks/useMeetingOnScreen';
import { MEETING_ADD_COPY as COPY } from '@config/meetingLive.config';

export const MeetingFab: React.FC = () => {
  const { meetingId, recording } = useMeetingOnScreen();
  const flow = useCreateFlow();
  const busy = flow !== null && flow.meetingId === meetingId;
  if (!meetingId || busy) return null;
  const chat: FabAction = { id: 'chat', label: COPY.chat, icon: RociMark, onSelect: () => startCreate('chat', meetingId) };
  if (recording) return <ActionFab label={COPY.chatLabel} actions={[{ ...chat, label: COPY.chatLabel }]} glyph={RociMark} />;
  return (
    <ActionFab
      label={COPY.add}
      actions={[
        chat,
        { id: 'todo', label: COPY.todo, icon: ListTodo, onSelect: () => startCreate('todo', meetingId) },
        { id: 'note', label: COPY.note, icon: NotebookPen, onSelect: () => startCreate('note', meetingId) },
      ]}
    />
  );
};
