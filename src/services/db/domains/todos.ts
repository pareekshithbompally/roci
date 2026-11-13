/**
 * Todos domain — list (per-meeting and global), upsert, complete, delete.
 */

import {
  call,
  rustTodoToEntry,
  rustTodoToGlobalEntry,
  type GlobalTodoEntry,
  type RustTodoListResult,
  type RustTodoRow,
} from '@services/db/internal';
import type { TodoEntry } from '@shared/types';

export const todos = {
  /** List todos for a specific meeting. */
  async listForMeeting(meetingId: string): Promise<TodoEntry[]> {
    const rows = await call<RustTodoRow[]>('todos_list_for_meeting', { meeting_id: meetingId });
    return rows.map(rustTodoToEntry);
  },

  /** List todos globally, optionally filtered by completion status. */
  async listGlobal(completed?: boolean, limit = 200, offset = 0): Promise<{ items: GlobalTodoEntry[]; total: number }> {
    const result = await call<RustTodoListResult>('todos_list_global', {
      completed: completed === undefined ? null : completed,
      limit,
      offset,
    });
    return {
      items: result.items.map(rustTodoToGlobalEntry),
      total: result.total,
    };
  },

  /** Create or update a todo. */
  async upsert(todo: {
    id: string;
    meetingId: string;
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
  },

  /** Set completion status. */
  async setCompleted(id: string, completed: boolean): Promise<void> {
    await call<void>('todos_set_completed', { id, completed });
  },

  /** Delete a todo (cascades to reminders). */
  async delete(id: string): Promise<void> {
    await call<void>('todos_delete', { id });
  },
};
