/** Meetings and chats as every screen reads them: the sidebar a page at a time, meetings matching a filter, one meeting by id,
 *  and counts — each straight from the store when a screen needs it, under `queryKeys.items()` so any write refreshes them all.
 *  Nothing holds a full list. Renames and deletes show at once (the refresh after the write reads the truth). */

import type { InfiniteData } from '@tanstack/react-query';
import { store, type ItemCursor, type ItemEntry, type ItemFilter } from '@services/db';
import { SIDEBAR_PAGE_SIZE } from '@config/chat.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { HistoryItem, MeetingIndexEntry } from '@shared/types';

/** A meeting's list row as screens use it (no transcript or summary: those load when it's opened). */
export function toHistoryItem(entry: MeetingIndexEntry): HistoryItem {
  return {
    id: entry.id,
    title: entry.title,
    categories: entry.categories,
    recordingFileName: entry.recordingFileName,
    audioRemovedAt: entry.audioRemovedAt,
    inputSource: entry.inputSource as HistoryItem['inputSource'],
    timestamp: new Date(entry.createdAt).getTime(),
    transcript: '',
    summary: '',
    status: entry.status,
    calendarEventId: entry.calendarEventId,
    scheduledTitle: entry.scheduledTitle,
    participants: entry.participants,
    scheduledStart: entry.scheduledStart,
    scheduledEnd: entry.scheduledEnd,
    meetingUrl: entry.meetingUrl,
  };
}

const meetingsOf = (entries: ItemEntry[]): HistoryItem[] =>
  entries.flatMap((entry) => (entry.kind === 'meeting' ? [toHistoryItem(entry.meeting)] : []));

const idOf = (entry: ItemEntry): string => (entry.kind === 'meeting' ? entry.meeting.id : entry.chat.id);

const cursorOf = (entry: ItemEntry): ItemCursor =>
  entry.kind === 'meeting'
    ? { at: new Date(entry.meeting.createdAt).getTime(), id: entry.meeting.id }
    : { at: entry.chat.lastMessageAt, id: entry.chat.id };

// ── Reads ──

export const sidebarQuery = {
  queryKey: queryKeys.sidebar(),
  queryFn: ({ pageParam }: { pageParam: ItemCursor | null }) => store.items.page(pageParam, SIDEBAR_PAGE_SIZE),
  initialPageParam: null as ItemCursor | null,
  getNextPageParam: (page: ItemEntry[]): ItemCursor | undefined =>
    page.length < SIDEBAR_PAGE_SIZE ? undefined : cursorOf(page[page.length - 1]),
};

/** The first `limit` meetings matching `filter`, newest first (recents, a picker's matches, busy ones, a calendar event's). */
export const meetingsFoundQuery = (filter: Omit<ItemFilter, 'kind'>, limit: number) => ({
  queryKey: queryKeys.meetingsFound(filter, limit),
  queryFn: async () => meetingsOf(await store.items.page(null, limit, { ...filter, kind: 'meeting' })),
});

/** One meeting's list row; null when it doesn't exist. */
export const meetingBriefQuery = (id: string) => ({
  queryKey: queryKeys.meetingBrief(id),
  queryFn: async () => meetingsOf(await store.items.byId('meeting', [id]))[0] ?? null,
});

export const itemCountsQuery = {
  queryKey: queryKeys.itemCounts(),
  queryFn: () => store.items.count(),
};

/** For code outside React (AI tools, URL actions): the same reads, cached the same way. */
export const fetchMeetingBrief = (id: string): Promise<HistoryItem | null> => queryClient.fetchQuery(meetingBriefQuery(id));
export const fetchMeetings = (filter: Omit<ItemFilter, 'kind'>, limit: number): Promise<HistoryItem[]> =>
  queryClient.fetchQuery(meetingsFoundQuery(filter, limit));

// ── Instant edits ──

/** Every loaded sidebar row through `edit` at once (null drops it), and a meeting's own row the same way. */
async function editLoaded(id: string, edit: (entry: ItemEntry) => ItemEntry | null, editMeeting: (item: HistoryItem) => HistoryItem | null) {
  await queryClient.cancelQueries({ queryKey: queryKeys.items() });
  queryClient.setQueryData<InfiniteData<ItemEntry[], ItemCursor | null>>(queryKeys.sidebar(), (data) =>
    data && { ...data, pages: data.pages.map((page) => page.flatMap((entry) => (idOf(entry) === id ? edit(entry) ?? [] : [entry]))) });
  queryClient.setQueryData<HistoryItem | null>(queryKeys.meetingBrief(id), (item) => (item ? editMeeting(item) : item));
}

const retitled = (entry: ItemEntry, title: string): ItemEntry =>
  entry.kind === 'meeting' ? { ...entry, meeting: { ...entry.meeting, title } } : { ...entry, chat: { ...entry.chat, title } };

export const itemEdits = {
  rename: (id: string, title: string) => editLoaded(id, (entry) => retitled(entry, title), (item) => ({ ...item, title })),
  remove: (id: string) => editLoaded(id, () => null, () => null),
};

/** After any meeting or chat write: every list reads the store again. */
export function refreshItems(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.items() }).catch((error: unknown) =>
    console.error('[Items] Refreshing the lists failed:', error));
}
