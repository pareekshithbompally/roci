/** The sidebar's data: one paged query (newest first, more as it scrolls) and its instant edits for renames and deletes.
 *  A write's refresh then reads the truth, so an edit that fails corrects itself. */

import type { InfiniteData } from '@tanstack/react-query';
import { store, type SidebarCursor, type SidebarEntry } from '@services/db';
import { SIDEBAR_PAGE_SIZE } from '@config/chat.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

const idOf = (entry: SidebarEntry): string => (entry.kind === 'meeting' ? entry.meeting.id : entry.chat.id);

const cursorOf = (entry: SidebarEntry): SidebarCursor =>
  entry.kind === 'meeting'
    ? { at: new Date(entry.meeting.createdAt).getTime(), id: entry.meeting.id }
    : { at: entry.chat.lastMessageAt, id: entry.chat.id };

export const sidebarQuery = {
  queryKey: queryKeys.sidebar(),
  queryFn: ({ pageParam }: { pageParam: SidebarCursor | null }) => store.sidebar.page(pageParam, SIDEBAR_PAGE_SIZE),
  initialPageParam: null as SidebarCursor | null,
  getNextPageParam: (page: SidebarEntry[]): SidebarCursor | undefined =>
    page.length < SIDEBAR_PAGE_SIZE ? undefined : cursorOf(page[page.length - 1]),
};

/** Every loaded row through `edit` at once (null drops it), before the write lands. */
async function editRows(edit: (entry: SidebarEntry) => SidebarEntry | null): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryKeys.sidebar() });
  queryClient.setQueryData<InfiniteData<SidebarEntry[], SidebarCursor | null>>(queryKeys.sidebar(), (data) =>
    data && { ...data, pages: data.pages.map((page) => page.flatMap((entry) => edit(entry) ?? [])) });
}

const retitled = (entry: SidebarEntry, title: string): SidebarEntry =>
  entry.kind === 'meeting' ? { ...entry, meeting: { ...entry.meeting, title } } : { ...entry, chat: { ...entry.chat, title } };

export const sidebarEdits = {
  rename: (id: string, title: string) => editRows((entry) => (idOf(entry) === id ? retitled(entry, title) : entry)),
  remove: (id: string) => editRows((entry) => (idOf(entry) === id ? null : entry)),
};
