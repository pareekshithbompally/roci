/**
 * History query migration tests.
 *
 * HistoryContext now owns the meeting index through TanStack Query:
 * load on mount, optimistic add/delete with rollback on failure,
 * and explicit reload via loadHistory. The mocked store below behaves
 * like the real one (list reflects prior upserts/deletes) so the
 * settle-and-refetch loop converges on truth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Entry = { id: string; title: string; categories: string[]; createdAt: string };

let db: Entry[] = [];

const entry = (id: string, title: string): Entry => ({
  id,
  title,
  categories: [],
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
});

vi.mock('@services/db', () => ({
  store: {
    meetings: {
      list: vi.fn(async () => ({ items: [...db] })),
      upsert: vi.fn(async (item: { id: string; title: string }) => {
        const i = db.findIndex((e) => e.id === item.id);
        if (i >= 0) db[i] = { ...db[i], title: item.title };
        else db.push(entry(item.id, item.title));
      }),
    },
  },
}));

vi.mock('@services/meeting.service', () => ({
  meetingService: {
    deleteMeeting: vi.fn(async (id: string) => {
      db = db.filter((e) => e.id !== id);
    }),
  },
}));

// eslint-disable-next-line import/first
import { store } from '@services/db';
// eslint-disable-next-line import/first
import { HistoryProvider, useHistoryData } from '@shared/contexts/HistoryContext';
// eslint-disable-next-line import/first
import type { HistoryItem } from '@shared/types';

const meetingsList = store.meetings.list as unknown as ReturnType<typeof vi.fn>;
const meetingsUpsert = store.meetings.upsert as unknown as ReturnType<typeof vi.fn>;

const newItem = (id: string, title: string): HistoryItem => ({
  id,
  title,
  transcript: 't',
  summary: 's',
  categories: [],
  timestamp: Date.now(),
});

function Probe() {
  const { items, isLoading, addToHistory, deleteItem } = useHistoryData();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="count">{items.length}</span>
      <span data-testid="first">{items[0]?.title ?? 'none'}</span>
      <span data-testid="titles">{items.map((i) => i.title).join(',')}</span>
      <button data-testid="add" onClick={() => addToHistory(newItem('m3', 'Third'))}>
        add
      </button>
      <button data-testid="del" onClick={() => deleteItem('m1')}>
        del
      </button>
    </div>
  );
}

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HistoryProvider>
        <Probe />
      </HistoryProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db = [entry('m1', 'First'), entry('m2', 'Second')];
});

describe('history query', () => {
  it('loads the index on mount', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('first').textContent).toBe('First');
    expect(meetingsList).toHaveBeenCalledTimes(1);
  });

  it('adds an item and converges on the persisted list', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    fireEvent.click(screen.getByTestId('add'));

    // Optimistic update shows immediately, then the refetch confirms it
    // (server order wins after settle — Third is present either way).
    await waitFor(() => expect(meetingsUpsert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'));
    expect(screen.getByTestId('titles').textContent).toContain('Third');
  });

  it('rolls back the optimistic add when the write fails', async () => {
    meetingsUpsert.mockRejectedValueOnce(new Error('disk full'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    fireEvent.click(screen.getByTestId('add'));

    await waitFor(() => expect(meetingsUpsert).toHaveBeenCalledTimes(1));
    // Rollback + refetch restore the original list.
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('First'));
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('removes a deleted item and converges on the persisted list', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    fireEvent.click(screen.getByTestId('del'));

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByTestId('first').textContent).toBe('Second');
  });
});
