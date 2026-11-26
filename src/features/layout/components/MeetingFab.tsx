/** A meeting's one + at the corner: Chat, To-do and Note once it has a page of its own, in the app's one menu (native on a
 *  Mac, iOS's on iPhone); while it records, only its chat (the notes are already on the record screen). Every action goes
 *  through `startCreate`; hidden while one of this meeting's is open (its panel or screen takes over). */

import React from 'react';
import { FabButton, RociMark } from '@shared/ui';
import { Menu, type MenuEntry } from '@shared/components';
import { startCreate, useCreateFlow } from '@shared/stores/createStore';
import { useMeetingOnScreen } from '@features/layout/hooks/useMeetingOnScreen';
import { MEETING_ADD_COPY as COPY } from '@config/meetingLive.config';
import { MENU_SYMBOLS } from '@config/ui.config';

export const MeetingFab: React.FC = () => {
  const { meetingId, recording } = useMeetingOnScreen();
  const flow = useCreateFlow();
  if (!meetingId || (flow !== null && flow.meetingId === meetingId)) return null;
  if (recording) return <FabButton label={COPY.chatLabel} glyph={RociMark} onClick={() => startCreate('chat', meetingId)} />;
  const items: MenuEntry[] = [
    { type: 'item', label: COPY.chat, symbol: MENU_SYMBOLS.chat, onSelect: () => startCreate('chat', meetingId) },
    { type: 'item', label: COPY.todo, symbol: MENU_SYMBOLS.todo, onSelect: () => startCreate('todo', meetingId) },
    { type: 'item', label: COPY.note, symbol: MENU_SYMBOLS.note, onSelect: () => startCreate('note', meetingId) },
  ];
  return <Menu label={COPY.add} trigger={<FabButton label={COPY.add} />} items={items} align="end" />;
};
