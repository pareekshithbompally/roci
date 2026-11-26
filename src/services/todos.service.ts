/** The one writer of to-dos: create, edit, done or not, delete. Every caller goes through here (the To-dos screen, a meeting,
 *  the AI's approved proposals, an MCP agent), so each change is written the same way and its reminder and the Reminders
 *  app follow it. Screens show the change at once through `useTodoActions`; this is what happens on disk. */

import { store } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { remindersSync } from '@services/reminders';
import { normalizeDueDate } from '@shared/utils/todo.utils';

export interface NewTodoInput {
  /** Chosen by the caller, so a list can show the row before it is saved. */
  id: string;
  /** The meeting it belongs to; null for a to-do of its own. */
  meetingId: string | null;
  text: string;
  dueDate?: string;
  owner?: string;
}

/** What an edit may change; what it leaves out stays as it is. */
export interface TodoEdit {
  text?: string;
  dueDate?: string | null;
  owner?: string | null;
}

const due = (date: string | null | undefined) => (date ? normalizeDueDate(date) : undefined);

export const todosService = {
  async create(todo: NewTodoInput): Promise<void> {
    await store.todos.upsert({
      id: todo.id,
      meetingId: todo.meetingId,
      text: todo.text,
      owner: todo.owner || undefined,
      dueDate: due(todo.dueDate),
      completed: false,
      source: 'user',
      createdAt: new Date().toISOString(),
    });
    void remindersSync.added([todo.id]);
  },

  async edit(id: string, edit: TodoEdit): Promise<void> {
    const [current] = await store.todos.get([id]);
    if (!current) throw new Error('This to-do no longer exists');
    await store.todos.upsert({
      ...current,
      ...(edit.text !== undefined && { text: edit.text }),
      ...(edit.dueDate !== undefined && { dueDate: due(edit.dueDate) }),
      ...(edit.owner !== undefined && { owner: edit.owner || undefined }),
    });
    void remindersSync.changed(id);
  },

  /** Done cancels its reminder; open again leaves it unset. */
  async setDone(id: string, done: boolean): Promise<void> {
    await store.todos.setCompleted(id, done);
    if (done) await reminderService.cancel(id);
    void remindersSync.changed(id);
  },

  async remove(id: string): Promise<void> {
    await reminderService.cancel(id);
    await store.todos.delete(id);
    void remindersSync.removed([id]);
  },
};
