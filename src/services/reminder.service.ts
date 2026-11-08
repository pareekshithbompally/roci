/**
 * Reminder Service
 *
 * Schedules, cancels, and reconciles todo reminders using native OS notifications.
 * Persists to the unified store (kasset.db) via the store client.
 * Pure service — no React dependency.
 */

import { notificationService } from './tauri/notification.service';
import { notificationScheduler } from './notification-scheduler';
import { store } from './db';
import type { ReminderEntry } from '@shared/types';
import { hashToNotificationId, formatReminderDate } from '@shared/utils/todo.utils';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type ViewMeetingHandler = (meetingId: string) => void;
let viewMeetingHandler: ViewMeetingHandler | null = null;

export interface ScheduleReminderParams {
  todoId: string;
  meetingId: string;
  todoText: string;
  meetingTitle: string;
  reminderDateTime: string; // ISO 8601
}

class ReminderService {
  private initialized = false;
  private unsubscribeAction: (() => void) | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.unsubscribeAction = notificationService.onActionType(
      'todo_reminder',
      (actionId, extra) => this.handleAction(actionId, extra),
    );

    await this.reconcile();

    this.initialized = true;
    console.log('[ReminderService] Initialized');
  }

  async schedule(params: ScheduleReminderParams): Promise<boolean> {
    const { todoId, meetingId, todoText, meetingTitle, reminderDateTime } = params;
    const notificationId = hashToNotificationId(todoId);
    const fireAt = new Date(reminderDateTime);

    if (fireAt.getTime() <= Date.now()) {
      console.warn('[ReminderService] Cannot schedule reminder in the past');
      return false;
    }

    // Cancel any existing reminder for this todo
    await this.cancel(todoId);

    // Schedule OS notification via the unified scheduler
    const key = `todo:${todoId}`;
    const scheduled = await notificationScheduler.schedule(key, {
      at: fireAt,
      title: meetingTitle,
      body: todoText,
      actionTypeId: 'todo_reminder',
      extra: { todoId, meetingId },
    });

    if (!scheduled) return false;

    // Persist to unified store
    await store.reminders.upsert(todoId, notificationId, fireAt.getTime());

    console.log(`[ReminderService] Scheduled reminder for "${todoText}" at ${formatReminderDate(reminderDateTime)}`);
    return true;
  }

  async cancel(todoId: string): Promise<void> {
    await notificationScheduler.cancel(`todo:${todoId}`);
    try {
      await store.reminders.setStatus(todoId, 'cancelled');
    } catch {
      // reminder may not exist in DB
    }

    console.log(`[ReminderService] Cancelled reminder for todo ${todoId}`);
  }

  async update(todoId: string, newDateTime: string, meetingId?: string): Promise<boolean> {
    const due = await store.reminders.due();
    const existing = due.find((r) => r.todoId === todoId);

    if (!existing && !meetingId) return false;

    const params: ScheduleReminderParams = existing
      ? { ...existing, reminderDateTime: newDateTime }
      : { todoId, meetingId: meetingId!, todoText: '', meetingTitle: '', reminderDateTime: newDateTime };

    return this.schedule(params);
  }

  async getReminder(todoId: string): Promise<ReminderEntry | null> {
    const due = await store.reminders.due();
    return due.find((r) => r.todoId === todoId) ?? null;
  }

  async getAllScheduled(): Promise<ReminderEntry[]> {
    return store.reminders.due();
  }

  onViewMeeting(handler: ViewMeetingHandler): () => void {
    viewMeetingHandler = handler;
    return () => { viewMeetingHandler = null; };
  }

  private async reconcile(): Promise<void> {
    try {
      // Prune entries older than 7 days
      await store.reminders.prune(SEVEN_DAYS_MS);

      const scheduled = await store.reminders.due();
      if (scheduled.length === 0) return;

      for (const entry of scheduled) {
        const fireAt = new Date(entry.reminderDateTime);

        if (fireAt.getTime() <= Date.now()) {
          await store.reminders.setStatus(entry.todoId, 'fired');
        } else if (!notificationScheduler.isScheduled(`todo:${entry.todoId}`)) {
          await notificationScheduler.schedule(`todo:${entry.todoId}`, {
            at: fireAt,
            title: entry.meetingTitle,
            body: entry.todoText,
            actionTypeId: 'todo_reminder',
            extra: { todoId: entry.todoId, meetingId: entry.meetingId },
          });
        }
      }

      console.log(`[ReminderService] Reconciled ${scheduled.length} scheduled reminders`);
    } catch (error) {
      console.error('[ReminderService] Reconciliation failed:', error);
    }
  }

  private async handleAction(actionId: string, extra?: Record<string, unknown>): Promise<void> {
    const todoId = extra?.todoId as string | undefined;
    const meetingId = extra?.meetingId as string | undefined;

    if (!todoId) return;

    switch (actionId) {
      case 'view_meeting':
        if (meetingId && viewMeetingHandler) {
          viewMeetingHandler(meetingId);
        }
        await store.reminders.setStatus(todoId, 'fired');
        break;

      case 'snooze_15': {
        const snoozeUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const due = await store.reminders.due();
        const existing = due.find((r) => r.todoId === todoId);
        if (existing) {
          await this.schedule({ ...existing, reminderDateTime: snoozeUntil });
        }
        break;
      }

      case 'dismiss':
        await store.reminders.setStatus(todoId, 'fired');
        break;
    }
  }

  dispose(): void {
    this.unsubscribeAction?.();
    this.initialized = false;
  }
}

export const reminderService = new ReminderService();
