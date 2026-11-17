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
    expect(result.current.matches?.map((i) => i.id)).toEqual(['m1']);
    expect(result.current.searching).toBe(true);
  });

  it('ranks index hits first, then title matches it missed', async () => {
    spotlightSearch.mockResolvedValueOnce([{ source_type: 'chat', source_id: 'c1', title: 'Pricing brainstorm', excerpt: 'sync later', timestamp: 1, match_type: 'content' }]);
    const { result } = renderHook(() => useSessionSearch(ITEMS, 'sync'));
    await settle();
    expect(result.current.matches?.map((i) => i.id)).toEqual(['c1', 'm1']);
    expect(result.current.searching).toBe(false);
  });

  it('drops a response for an older query', async () => {
    let resolveOld!: (hits: never[]) => void;
    spotlightSearch.mockImplementationOnce(() => new Promise<never[]>((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(({ q }) => useSessionSearch(ITEMS, q), { initialProps: { q: 'sync' } });
    await settle();
    rerender({ q: 'pricing' });
    await settle();
    await act(async () => resolveOld([]));
    expect(result.current.matches?.map((i) => i.id)).toEqual(['c1']);
  });
});
