/** Sidebar domain — the sidebar a page at a time: meetings and chats by time, names and status only (no transcripts or
 *  messages), so it loads what's on screen and has no cap. */

import { call, toChatIndexEntry, toMeetingIndexEntry, type ChatIndexRow } from '@services/db/internal';
import type { MeetingRow } from '@shared/types/native';
import type { ChatIndexEntry, MeetingIndexEntry } from '@shared/types';

/** Where a page ends: its last row's time and id. */
export interface SidebarCursor {
  at: number;
  id: string;
}

export type SidebarEntry = { kind: 'meeting'; meeting: MeetingIndexEntry } | { kind: 'chat'; chat: ChatIndexEntry };

type SidebarRow = ({ kind: 'meeting' } & MeetingRow) | ({ kind: 'chat' } & ChatIndexRow);

const toEntry = (row: SidebarRow): SidebarEntry =>
  row.kind === 'meeting' ? { kind: 'meeting', meeting: toMeetingIndexEntry(row) } : { kind: 'chat', chat: toChatIndexEntry(row) };

export const sidebar = {
  /** The next `limit` rows after `before` (from the newest when null), newest first. */
  async page(before: SidebarCursor | null, limit: number): Promise<SidebarEntry[]> {
    return (await call<SidebarRow[]>('sidebar_page', { before, limit })).map(toEntry);
  },
};
