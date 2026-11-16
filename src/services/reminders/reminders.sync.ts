/** Two-way to-do ↔ Reminders sync (completion pulls back); own writes echo harmlessly; logs and never throws. */

import { store } from '@services/db';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersService, type ReminderInput } from './reminders.service';
import type { TodoEntry } from '@shared/types';

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

function toReminder(listId: string, todo: TodoEntry, notes: string | null, create: boolean): ReminderInput {
  return {
    list_id: listId,
    todo_id: todo.id,
    title: todo.text,
    notes,
    due_date: todo.dueDate?.match(YMD)?.[0] ?? null,
    completed: todo.completed,
    create,
  };
}

async function meetingTodos(meetingId: string): Promise<{ todos: TodoEntry[]; notes: string | null }> {
  const meeting = await store.meetings.get(meetingId);
  const title = meeting?.index.title;
  return { todos: meeting?.todos ?? [], notes: title ? `From “${title}” in Roci` : null };
}

async function send(listId: string, meetingId: string, pick: (todo: TodoEntry) => boolean, create: boolean): Promise<void> {
  const { todos, notes } = await meetingTodos(meetingId);
  const items = todos.filter(pick).map((todo) => toReminder(listId, todo, notes, create));
  if (items.length > 0) await remindersService.upsert(items);
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

  /** New action items of a meeting (all of them, or `todoIds`) → new reminders. */
  async added(meetingId: string, todoIds?: string[]): Promise<void> {
    const pick = todoIds ? (todo: TodoEntry) => todoIds.includes(todo.id) : () => true;
    try {
      const listId = await readyList();
      if (listId) await send(listId, meetingId, pick, true);
    } catch (error: unknown) {
      report('add')(error);
    }
  },

  /** An edited or toggled to-do → its existing reminder. */
  async changed(meetingId: string, todoId: string): Promise<void> {
    try {
      const listId = await readyList();
      if (listId) await send(listId, meetingId, (todo) => todo.id === todoId, false);
    } catch (error: unknown) {
      report('update')(error);
    }
  },

  /** Every open to-do → reminders in `listId`. Called once, when the user turns the integration on. */
  async sendOpen(listId: string): Promise<void> {
    try {
      const { items } = await store.todos.listGlobal(false, PAGE, 0);
      const meetings = new Set(items.map((todo) => todo.meetingId));
      await Promise.all([...meetings].map((meetingId) => send(listId, meetingId, (todo) => !todo.completed, true)));
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
