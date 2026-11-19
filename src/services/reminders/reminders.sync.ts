/** Two-way to-do ↔ Reminders sync (completion pulls back); own writes echo harmlessly; logs and never throws. */

import { store } from '@services/db';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersService, type ReminderInput } from './reminders.service';
import type { GlobalTodoEntry } from '@services/db';

interface SyncTarget {
  enabled: boolean;
  listId?: string;
}

/** Global to-dos are read in pages of this size when pulling completion. */
const PAGE = 500;
const YMD = /^\d{4}-\d{2}-\d{2}/;

let target: SyncTarget = { enabled: false };

/** The list to sync with, or null when the integration is off or access is gone. */
async function readyList(): Promise<string | null> {
  if (!target.enabled || !target.listId) return null;
  return (await remindersService.checkAccess()) === 'authorized' ? target.listId : null;
}

function toReminder(listId: string, todo: GlobalTodoEntry, create: boolean): ReminderInput {
  return {
    list_id: listId,
    todo_id: todo.id,
    title: todo.text,
    notes: todo.meetingTitle ? `From “${todo.meetingTitle}” in Roci` : null,
    due_date: todo.dueDate?.match(YMD)?.[0] ?? null,
    completed: todo.completed,
    create,
  };
}

async function send(listId: string, todos: GlobalTodoEntry[], create: boolean): Promise<void> {
  if (todos.length > 0) await remindersService.upsert(todos.map((todo) => toReminder(listId, todo, create)));
}

/** Runs `work` with the synced list when the integration is on; logs failures, never throws. */
async function withList(action: string, work: (listId: string) => Promise<void>): Promise<void> {
  try {
    const listId = await readyList();
    if (listId) await work(listId);
  } catch (error: unknown) {
    report(action)(error);
  }
}

async function allTodos(): Promise<Map<string, boolean>> {
  const completion = new Map<string, boolean>();
  for (let offset = 0; ; offset += PAGE) {
    const { items, total } = await store.todos.listGlobal(undefined, PAGE, offset);
    items.forEach((todo) => completion.set(todo.id, todo.completed));
    if (offset + PAGE >= total) return completion;
  }
}

function report(action: string) {
  return (error: unknown) => console.error(`[remindersSync] ${action} failed:`, error);
}

export const remindersSync = {
  /** Where to sync; set by the Reminders runtime whenever settings change. */
  configure(next: SyncTarget): void {
    target = next;
  },

  /** New to-dos → new reminders. */
  async added(todoIds: string[]): Promise<void> {
    await withList('add', async (listId) => send(listId, await store.todos.get(todoIds), true));
  },

  /** A meeting's action items, just written by its summary → new reminders. */
  async addedForMeeting(meetingId: string): Promise<void> {
    await withList('add', async (listId) => send(listId, await store.todos.listForMeeting(meetingId), true));
  },

  /** An edited or completed to-do → its existing reminder. */
  async changed(todoId: string): Promise<void> {
    await withList('update', async (listId) => send(listId, await store.todos.get([todoId]), false));
  },

  /** To-dos deleted in Roci (a new summary replaced them) → their reminders deleted. */
  async removed(todoIds: string[]): Promise<void> {
    if (todoIds.length === 0) return;
    await withList('remove', (listId) => remindersService.remove(listId, todoIds));
  },

  /** Every open to-do → reminders in `listId`. Called once, when the user turns the integration on. */
  async sendOpen(listId: string): Promise<void> {
    try {
      const { items } = await store.todos.listGlobal(false, PAGE, 0);
      await send(listId, items, true);
    } catch (error: unknown) {
      report('send open')(error);
    }
  },

  /** Completion made in Reminders → the matching to-dos. */
  async pull(): Promise<void> {
    try {
      const listId = await readyList();
      if (!listId) return;
      const [states, completion] = await Promise.all([remindersService.states(listId), allTodos()]);
      const stale = states.filter((s) => completion.has(s.todo_id) && completion.get(s.todo_id) !== s.completed);
      if (stale.length === 0) return;
      await Promise.all(stale.map((s) => store.todos.setCompleted(s.todo_id, s.completed)));
      await queryClient.invalidateQueries({ queryKey: queryKeys.storeTodosAll() });
    } catch (error: unknown) {
      report('pull')(error);
    }
  },
};
