import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SPOTLIGHT_DEBOUNCE_MS } from '@config/chat.config';
import type { UnifiedSidebarItem } from '@shared/types';

vi.mock('@extensions/rag/client', () => ({
  vectorDB: { spotlightSearch: vi.fn(async () => []) },
}));

import { vectorDB } from '@extensions/rag/client';
import { useSessionSearch } from '@features/history/hooks/useSessionSearch';

const spotlightSearch = vectorDB.spotlightSearch as unknown as ReturnType<typeof vi.fn>;

const ITEMS = [
  { id: 'm1', type: 'meeting', title: 'Weekly Sync', timestamp: 2 },
  { id: 'c1', type: 'chat', title: 'Pricing brainstorm', timestamp: 1 },
] as unknown as UnifiedSidebarItem[];

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(SPOTLIGHT_DEBOUNCE_MS + 50); });

describe('useSessionSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not search a too-short query', () => {
    const { result } = renderHook(() => useSessionSearch(ITEMS, ''));
    expect(result.current.matches).toBeNull();
    expect(spotlightSearch).not.toHaveBeenCalled();
  });

  it('shows title matches at once, while the index is still searching', () => {
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'sync'));
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['m1']);
    expect(result.current.searching).toBe(true);
  });

  it('keeps title matches where they are and adds content matches below them (rows never move)', async () => {
    spotlightSearch.mockResolvedValueOnce([
      { source_type: 'chat', source_id: 'c1', title: 'Pricing brainstorm', excerpt: 'sync later', timestamp: 1, match_type: 'content' },
      { source_type: 'meeting', source_id: 'm1', title: 'Weekly Sync', excerpt: 'Weekly <<MARK>>Sync<</MARK>>', timestamp: 2, match_type: 'title' },
    ]);
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'sync'));
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['m1']);
    await settle();
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['m1', 'c1']);
    expect(result.current.searching).toBe(false);
  });

  it('matches titles from the first letter, searching the index only from the second', () => {
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'p'));
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['c1']);
    expect(spotlightSearch).not.toHaveBeenCalled();
  });

  it('keeps the index excerpt for a content match, none for a title match', async () => {
    spotlightSearch.mockResolvedValueOnce([{ source_type: 'chat', source_id: 'c1', title: 'Pricing brainstorm', excerpt: 'we <<MARK>>sync<</MARK>> later', timestamp: 1, match_type: 'content' }]);
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'sync'));
    await settle();
    expect(result.current.matches?.map((m) => m.excerpt)).toEqual(['', 'we <<MARK>>sync<</MARK>> later']);
  });

  it('keeps the content matches on screen while the next letter is searched (no flicker)', async () => {
    spotlightSearch.mockResolvedValue([{ source_type: 'chat', source_id: 'c1', title: 'Pricing brainstorm', excerpt: 'we sync later', timestamp: 1, match_type: 'content' }]);
    const { result, rerender } = renderHook(({ q }) => useSessionSearch(ITEMS, q), { initialProps: { q: 'syn' } });
    await settle();
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['m1', 'c1']);
    rerender({ q: 'sync' });
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['m1', 'c1']);
  });

  it('keeps a content match for an item not loaded in the list (beyond the most recent ones)', async () => {
    spotlightSearch.mockResolvedValueOnce([{ source_type: 'meeting', source_id: 'old', title: 'Old offsite', excerpt: 'the <<MARK>>sync<</MARK>>', timestamp: 5, match_type: 'content' }]);
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'sync'));
    await settle();
    const old = result.current.matches?.find((m) => m.item.id === 'old');
    expect(old?.item).toMatchObject({ type: 'meeting', title: 'Old offsite', historyItem: { id: 'old' } });
  });

  it('asks the index for as many as it is told, and says which kinds it may have cut short', async () => {
    spotlightSearch.mockResolvedValueOnce([
      { source_type: 'chat', source_id: 'c1', title: 'Pricing brainstorm', excerpt: 'a', timestamp: 1, match_type: 'content' },
      { source_type: 'chat', source_id: 'c2', title: 'Other', excerpt: 'b', timestamp: 1, match_type: 'content' },
    ]);
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'zz', 2));
    await settle();
    expect(spotlightSearch).toHaveBeenCalledWith({ query: 'zz', limit: 2 });
    expect(result.current.capped).toEqual(['chat']);
  });

  it('drops a response for an older query', async () => {
    let resolveOld!: (hits: never[]) => void;
    spotlightSearch.mockImplementationOnce(() => new Promise<never[]>((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(({ q }) => useSessionSearch(ITEMS, q), { initialProps: { q: 'sync' } });
    await settle();
    rerender({ q: 'pricing' });
    await settle();
    await act(async () => resolveOld([]));
    expect(result.current.matches?.map((m) => m.item.id)).toEqual(['c1']);
  });
});
