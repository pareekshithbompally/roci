import { describe, it, expect, vi } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import type { SidebarEntry } from '@services/db';

vi.mock('@services/db', () => ({ store: { sidebar: { page: vi.fn() } } }));

import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { sidebarEdits, sidebarQuery } from '@shared/query/sidebar';
import { SIDEBAR_PAGE_SIZE } from '@config/chat.config';

const chat = (id: string, at: number): SidebarEntry => ({ kind: 'chat', chat: { id, title: id, lastMessageAt: at } });
const meeting = (id: string, at: number) =>
  ({ kind: 'meeting', meeting: { id, title: id, categories: [], status: { status: 'ready' }, createdAt: new Date(at).toISOString(), updatedAt: '' } }) as SidebarEntry;

describe('the sidebar query', () => {
  it('asks for the next page after the last row, and stops at a short page', () => {
    const full = Array.from({ length: SIDEBAR_PAGE_SIZE }, (_, i) => chat(`c${i}`, 1000 - i));
    expect(sidebarQuery.getNextPageParam(full)).toEqual({ at: 1000 - (SIDEBAR_PAGE_SIZE - 1), id: `c${SIDEBAR_PAGE_SIZE - 1}` });
    expect(sidebarQuery.getNextPageParam([meeting('m1', 500)])).toBeUndefined();
  });

  it('renames and removes a row in every loaded page at once, before the write lands', async () => {
    queryClient.setQueryData<InfiniteData<SidebarEntry[], unknown>>(queryKeys.sidebar(), {
      pages: [[chat('c1', 3), meeting('m1', 2)], [chat('c2', 1)]],
      pageParams: [null, { at: 2, id: 'm1' }],
    });
    await sidebarEdits.rename('m1', 'Renamed');
    await sidebarEdits.remove('c2');
    const data = queryClient.getQueryData<InfiniteData<SidebarEntry[], unknown>>(queryKeys.sidebar())!;
    expect(data.pages.flat().map((e) => (e.kind === 'chat' ? e.chat.title : e.meeting.title))).toEqual(['c1', 'Renamed']);
    expect(data.pageParams).toEqual([null, { at: 2, id: 'm1' }]);
  });
});
