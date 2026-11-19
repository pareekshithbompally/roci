/** Todos domain — list (per-meeting and global), upsert, complete, delete. */

import {
  call,
  rustTodoToGlobalEntry,
  type GlobalTodoEntry,
} from '@services/db/internal';
import type { TodosListResult, TodoWithReminder } from '@shared/types/native';
import { meetingEdited } from './meetingEdits';

export const todos = {
  /** List todos for a specific meeting. */
  async listForMeeting(meetingId: string): Promise<GlobalTodoEntry[]> {
    const rows = await call<TodoWithReminder[]>('todos_list_for_meeting', { meetingId });
    return rows.map(rustTodoToGlobalEntry);
  },

  /** The to-dos with these ids, with their meeting; unknown ids are left out. */
  async get(ids: string[]): Promise<GlobalTodoEntry[]> {
    const rows = await call<TodoWithReminder[]>('todos_get', { ids });
    return rows.map(rustTodoToGlobalEntry);
  },

  /** List todos globally, optionally filtered by completion status. */
  async listGlobal(completed?: boolean, limit = 200, offset = 0): Promise<{ items: GlobalTodoEntry[]; total: number }> {
    const result = await call<TodosListResult>('todos_list_global', {
      completed: completed === undefined ? null : completed,
      limit,
      offset,
    });
    return {
      items: result.items.map(rustTodoToGlobalEntry),
      total: result.total,
    };
  },

  /** Create or update a todo; `meetingId` null for a to-do of its own. */
  async upsert(todo: {
    id: string;
    meetingId: string | null;
    text: string;
    owner?: string;
    dueDate?: string;
    completed?: boolean;
    source?: 'ai' | 'user';
    createdAt?: string;
  }): Promise<void> {
    await call<void>('todos_upsert', {
      input: {
        id: todo.id,
        meeting_id: todo.meetingId,
        text: todo.text,
        owner: todo.owner ?? null,
        due_date: todo.dueDate ?? null,
        completed: todo.completed ?? null,
        source: todo.source ?? null,
        created_at: todo.createdAt ? new Date(todo.createdAt).getTime() : null,
      },
    });
    meetingEdited(todo.meetingId);
  },

  /** Set completion status. */
  async setCompleted(id: string, completed: boolean): Promise<void> {
    const [todo] = await todos.get([id]);
    await call<void>('todos_set_completed', { id, completed });
    meetingEdited(todo?.meetingId);
  },

  /** Delete a todo (cascades to reminders); its meeting is read first, while the to-do still exists. */
  async delete(id: string): Promise<void> {
    const [todo] = await todos.get([id]);
    await call<void>('todos_delete', { id });
    meetingEdited(todo?.meetingId);
  },
};
