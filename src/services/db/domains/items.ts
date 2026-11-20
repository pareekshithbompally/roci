/** Items domain — meetings and chats read the same way: a page (newest first, the next one after a cursor), by id, or a count.
 *  Names, times and status only (no transcripts or messages), so every list reads just what it shows and nothing has a cap. */

import { call, toChatIndexEntry, toMeetingIndexEntry, type ChatIndexRow } from '@services/db/internal';
import type { MeetingRow } from '@shared/types/native';
import type { ChatIndexEntry, MeetingIndexEntry } from '@shared/types';

/** Where a page ends: its last item's time and id. */
export interface ItemCursor {
  at: number;
  id: string;
}

export type ItemKind = 'meeting' | 'chat';

/** Which items a page covers; meeting-only fields leave chats out. */
export interface ItemFilter {
  kind?: ItemKind;
  /** Epoch ms, inclusive. */
  since?: number;
  /** Epoch ms, exclusive. */
  until?: number;
  /** Words the title must all contain (any case). */
  words?: string[];
  /** Meetings in one of these statuses. */
  statuses?: string[];
  /** Meetings recorded from this calendar event. */
  calendarEvent?: string;
}

export type ItemEntry = { kind: 'meeting'; meeting: MeetingIndexEntry } | { kind: 'chat'; chat: ChatIndexEntry };

type ItemRow = ({ kind: 'meeting' } & MeetingRow) | ({ kind: 'chat' } & ChatIndexRow);

const toEntry = (row: ItemRow): ItemEntry =>
  row.kind === 'meeting' ? { kind: 'meeting', meeting: toMeetingIndexEntry(row) } : { kind: 'chat', chat: toChatIndexEntry(row) };

const toRustFilter = ({ calendarEvent, ...rest }: ItemFilter = {}) => ({ ...rest, calendar_event: calendarEvent });

export const items = {
  /** The next `limit` items after `before` (from the newest when null), newest first. */
  async page(before: ItemCursor | null, limit: number, filter?: ItemFilter): Promise<ItemEntry[]> {
    return (await call<ItemRow[]>('items_page', { before, limit, filter: toRustFilter(filter) })).map(toEntry);
  },

  /** These items of one kind by id; ids that no longer exist are left out. */
  async byId(kind: ItemKind, ids: string[]): Promise<ItemEntry[]> {
    if (ids.length === 0) return [];
    return (await call<ItemRow[]>('items_by_id', { kind, ids })).map(toEntry);
  },

  /** How many meetings and chats (with messages) there are. */
  async count(): Promise<{ meetings: number; chats: number }> {
    return call('items_count');
  },
};
