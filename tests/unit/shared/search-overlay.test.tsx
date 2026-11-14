import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchOverlay } from '@shared/components/SearchOverlayDialog';
import { SPOTLIGHT_DEBOUNCE_MS } from '@config/chat.config';

vi.mock('@shared/hooks/useUnifiedSidebar', () => ({
  useUnifiedSidebar: () => ({
    items: [
      { id: 'm1', type: 'meeting', title: 'Weekly Sync', timestamp: Date.now(), historyItem: { id: 'm1', title: 'Weekly Sync' } },
      { id: 'c1', type: 'chat', title: 'Pricing brainstorm', timestamp: Date.now() - 3_600_000 },
    ],
    isLoading: false,
  }),
}));

vi.mock('@shared/contexts/ChatContext', () => ({
  useChat: () => ({ setCurrentSessionId: vi.fn(), selectSession: vi.fn() }),
}));

vi.mock('@shared/hooks/useMeetingDetailLoader', () => ({
  useMeetingDetailLoader: () => vi.fn(),
}));

vi.mock('@extensions/rag/client', () => ({
  vectorDB: { spotlightSearch: vi.fn(async () => []) },
}));

import { vectorDB } from '@extensions/rag/client';

const spotlightSearch = vectorDB.spotlightSearch as unknown as ReturnType<typeof vi.fn>;

function openOverlay() {
  render(<SearchOverlay open onOpenChange={() => {}} />);
}

// cmdk scrolls the active item into view — not implemented in jsdom.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('SearchOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows recent items for an empty query', () => {
    openOverlay();

    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.getByText('Pricing brainstorm')).toBeInTheDocument();
  });

  it('shows in-memory title matches with a group count, no DB excerpt needed', async () => {
    openOverlay();

    fireEvent.change(screen.getByPlaceholderText('Search meetings and chats...'), {
      target: { value: 'sync' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SPOTLIGHT_DEBOUNCE_MS + 50);
    });

    expect(screen.getByText('Meetings (1)')).toBeInTheDocument();
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
  });

  it('shows the no-results state when nothing matches', async () => {
    openOverlay();

    fireEvent.change(screen.getByPlaceholderText('Search meetings and chats...'), {
      target: { value: 'zzz-no-such-thing' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SPOTLIGHT_DEBOUNCE_MS + 50);
    });

    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });

  it('holds previous hits until the merged set lands — one paint per keystroke', async () => {
    let resolveDb!: (hits: never[]) => void;
    spotlightSearch.mockImplementationOnce(
      () => new Promise<never[]>((resolve) => { resolveDb = resolve; }),
    );
    openOverlay();

    // First paint: memory hits land on the empty list.
    fireEvent.change(screen.getByPlaceholderText('Search meetings and chats...'), {
      target: { value: 'sync' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPOTLIGHT_DEBOUNCE_MS + 50);
    });
    expect(screen.getByText('Meetings (1)')).toBeInTheDocument();

    // New keystroke, DB still in flight: old hits held, no empty flash.
    spotlightSearch.mockImplementationOnce(
      () => new Promise<never[]>((resolve) => { resolveDb = resolve; }),
    );
    fireEvent.change(screen.getByPlaceholderText('Search meetings and chats...'), {
      target: { value: 'syncx' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPOTLIGHT_DEBOUNCE_MS + 50);
    });
    expect(screen.getByText('Meetings (1)')).toBeInTheDocument();
    expect(screen.queryByText(/No results for/)).not.toBeInTheDocument();

    // Merged set lands empty: hits leave and the empty state arrives together.
    await act(async () => {
      resolveDb([]);
    });
    expect(screen.queryByText('Meetings (1)')).not.toBeInTheDocument();
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });
});
