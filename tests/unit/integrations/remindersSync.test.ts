import { describe, it, expect, vi, beforeEach } from 'vitest';

const service = vi.hoisted(() => ({
  checkAccess: vi.fn(),
  upsert: vi.fn(),
  states: vi.fn(),
}));
const db = vi.hoisted(() => ({
  get: vi.fn(),
  listForMeeting: vi.fn(),
  listGlobal: vi.fn(),
  setCompleted: vi.fn(),
}));
const invalidate = vi.hoisted(() => vi.fn());

vi.mock('@services/reminders/reminders.service', () => ({ remindersService: service }));
vi.mock('@services/db', () => ({
  store: {
    todos: { get: db.get, listForMeeting: db.listForMeeting, listGlobal: db.listGlobal, setCompleted: db.setCompleted },
  },
}));
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries: invalidate } }));

import { remindersSync } from '@services/reminders/reminders.sync';

const todo = (id: string, completed = false, meetingTitle: string | null = 'Standup') => ({
  id, text: `do ${id}`, completed, source: 'ai' as const, createdAt: '', dueDate: '2026-11-20T00:00:00Z',
  meetingId: meetingTitle ? 'm1' : null, meetingTitle,
});

beforeEach(() => {
  vi.clearAllMocks();
  service.checkAccess.mockResolvedValue('authorized');
  db.listForMeeting.mockResolvedValue([todo('a'), todo('b', true)]);
  db.get.mockImplementation(async (ids: string[]) => [todo('a'), todo('b', true), todo('own', false, null)].filter((t) => ids.includes(t.id)));
  remindersSync.configure({ enabled: true, listId: 'L1' });
});

describe('remindersSync', () => {
  it('addedForMeeting: creates reminders for the meeting action items, tagged and dated', async () => {
    await remindersSync.addedForMeeting('m1');
    const items = service.upsert.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      list_id: 'L1', todo_id: 'a', title: 'do a', notes: 'From “Standup” in Roci',
      due_date: '2026-11-20', completed: false, create: true,
    });
  });

  it('added: only those to-dos', async () => {
    await remindersSync.added(['b']);
    expect(service.upsert.mock.calls[0][0].map((i: { todo_id: string }) => i.todo_id)).toEqual(['b']);
  });

  it('added: a to-do without a meeting syncs with no meeting note', async () => {
    await remindersSync.added(['own']);
    expect(service.upsert).toHaveBeenCalledWith([expect.objectContaining({ todo_id: 'own', notes: null, create: true })]);
  });

  it('changed: updates the existing reminder only (never re-creates)', async () => {
    await remindersSync.changed('b');
    expect(service.upsert).toHaveBeenCalledWith([expect.objectContaining({ todo_id: 'b', completed: true, create: false })]);
  });

  it('does nothing when off or when macOS access is gone', async () => {
    remindersSync.configure({ enabled: false, listId: 'L1' });
    await remindersSync.added(['a']);
    remindersSync.configure({ enabled: true, listId: 'L1' });
    service.checkAccess.mockResolvedValue('denied');
    await remindersSync.changed('a');
    await remindersSync.pull();
    expect(service.upsert).not.toHaveBeenCalled();
    expect(service.states).not.toHaveBeenCalled();
  });

  it('pull: copies completion only where it differs, for to-dos that exist', async () => {
    service.states.mockResolvedValue([
      { todo_id: 'a', completed: true },   // ticked in Reminders → complete in Roci
      { todo_id: 'b', completed: true },   // already matches → untouched
      { todo_id: 'gone', completed: true }, // deleted in Roci → ignored
    ]);
    db.listGlobal.mockResolvedValue({ items: [{ ...todo('a'), meetingId: 'm1' }, { ...todo('b', true), meetingId: 'm1' }], total: 2 });
    await remindersSync.pull();
    expect(db.setCompleted).toHaveBeenCalledTimes(1);
    expect(db.setCompleted).toHaveBeenCalledWith('a', true);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('pull: no writes and no refetch when everything matches (no echo loop)', async () => {
    service.states.mockResolvedValue([{ todo_id: 'b', completed: true }]);
    db.listGlobal.mockResolvedValue({ items: [{ ...todo('b', true), meetingId: 'm1' }], total: 1 });
    await remindersSync.pull();
    expect(db.setCompleted).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('never throws into the caller', async () => {
    service.upsert.mockRejectedValue(new Error('EventKit down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(remindersSync.added(['a'])).resolves.toBeUndefined();
    log.mockRestore();
  });
});
