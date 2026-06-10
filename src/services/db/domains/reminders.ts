/**
 * Reminders domain — schedule, update status, list due, prune stale entries.
 */

import { call, rustReminderDueToEntry, type RustReminderDueItem } from '../internal';
import type { ReminderEntry } from '@shared/types';

export const reminders = {
  /** Upsert a reminder (schedule or reschedule). */
  async upsert(todoId: string, notificationId: number, fireAt: number): Promise<void> {
    await call<void>('reminders_upsert', { todoId, notificationId, fireAt });
  },

  /** Set reminder status. */
  async setStatus(todoId: string, status: 'scheduled' | 'fired' | 'cancelled'): Promise<void> {
    await call<void>('reminders_set_status', { todoId, status });
  },

  /** Get all scheduled reminders (joined with todo/meeting info). */
  async due(): Promise<ReminderEntry[]> {
    const rows = await call<RustReminderDueItem[]>('reminders_due');
    return rows.map(rustReminderDueToEntry);
  },

  /** Prune stale (fired/cancelled) reminders older than maxAgeMs. */
  async prune(maxAgeMs: number): Promise<void> {
    await call<void>('reminders_prune', { maxAgeMs });
  },
};
