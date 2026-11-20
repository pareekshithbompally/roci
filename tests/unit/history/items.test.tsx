/** The sidebar and meeting edits over the store's paged items: loads a page on mount, renames and deletes show at once and
 *  converge on what the store holds, a failed rename comes back. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

type Row = { id: string; title: string };
let db: Row[] = [];

const entry = ({ id, title }: Row) => ({
  kind: 'meeting' as const,
  meeting: { id, title, categories: [], status: { status: 'ready' }, createdAt: new Date(2026, 0, 2).toISOString(), updatedAt: '' },
});

vi.mock('@services/db', () => ({
  store: {
    items: {
      page: vi.fn(async () => db.map(entry)),
      byId: vi.fn(async (_kind: string, ids: string[]) => db.filter((r) => ids.includes(r.id)).map(entry)),
    },
    meetings: {
      rename: vi.fn(async (id: string, title: string) => {
        db = db.map((r) => (r.id === id ? { ...r, title } : r));
      }),
    },
  },
}));
vi.mock('@services/meeting.service', () => ({
  meetingService: { deleteMeeting: vi.fn(async (id: string) => { db = db.filter((r) => r.id !== id); }) },
}));

// eslint-disable-next-line import/first
import { store } from '@services/db';
// eslint-disable-next-line import/first
import { queryClient } from '@shared/query/queryClient';
// eslint-disable-next-line import/first
import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
// eslint-disable-next-line import/first
import { useMeetingMutations } from '@shared/hooks/useMeetings';

function Probe() {
  const { items, isLoading } = useUnifiedSidebar();
  const { renameMeeting, deleteMeeting } = useMeetingMutations();
  return (
    <div>
      <span data-testid="state">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="titles">{items.map((i) => i.title).join(',')}</span>
      <button data-testid="rename" onClick={() => void renameMeeting('m1', 'Renamed')}>rename</button>
      <button data-testid="del" onClick={() => void deleteMeeting('m1')}>del</button>
    </div>
  );
}

const show = () => render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
const titles = () => screen.getByTestId('titles').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  db = [{ id: 'm1', title: 'First' }, { id: 'm2', title: 'Second' }];
});

describe('the sidebar over the store', () => {
  it('loads one page on mount, names only', async () => {
    show();
    await waitFor(() => expect(titles()).toBe('First,Second'));
    expect(store.items.page).toHaveBeenCalledTimes(1);
  });

  it('shows a rename at once and keeps it once the store has it', async () => {
    show();
    await waitFor(() => expect(titles()).toBe('First,Second'));
    fireEvent.click(screen.getByTestId('rename'));
    await waitFor(() => expect(titles()).toBe('Renamed,Second'));
    expect(store.meetings.rename).toHaveBeenCalledWith('m1', 'Renamed');
  });

  it('comes back to the stored title when the rename fails', async () => {
    vi.mocked(store.meetings.rename).mockRejectedValueOnce(new Error('disk full'));
    show();
    await waitFor(() => expect(titles()).toBe('First,Second'));
    fireEvent.click(screen.getByTestId('rename'));
    await waitFor(() => expect(titles()).toBe('First,Second'));
  });

  it('removes a deleted meeting', async () => {
    show();
    await waitFor(() => expect(titles()).toBe('First,Second'));
    fireEvent.click(screen.getByTestId('del'));
    await waitFor(() => expect(titles()).toBe('Second'));
  });
});
