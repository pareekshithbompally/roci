/** HistoryContext via TanStack Query; the mocked store reflects prior upserts/deletes so refetches converge. */

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
      rename: vi.fn(async (id: string, title: string) => {
        const i = db.findIndex((e) => e.id === id);
        if (i >= 0) db[i] = { ...db[i], title };
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

const meetingsList = store.meetings.list as unknown as ReturnType<typeof vi.fn>;
const meetingsRename = store.meetings.rename as unknown as ReturnType<typeof vi.fn>;

function Probe() {
  const { items, isLoading, renameItem, deleteItem } = useHistoryData();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="count">{items.length}</span>
      <span data-testid="first">{items[0]?.title ?? 'none'}</span>
      <span data-testid="titles">{items.map((i) => i.title).join(',')}</span>
      <button data-testid="rename" onClick={() => renameItem('m1', 'Renamed')}>
        rename
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

  it('renames an item and converges on the persisted list', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    fireEvent.click(screen.getByTestId('rename'));

    await waitFor(() => expect(meetingsRename).toHaveBeenCalledWith('m1', 'Renamed'));
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('Renamed'));
  });

  it('rolls back the optimistic rename when the write fails', async () => {
    meetingsRename.mockRejectedValueOnce(new Error('disk full'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    fireEvent.click(screen.getByTestId('rename'));

    await waitFor(() => expect(meetingsRename).toHaveBeenCalledTimes(1));
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
