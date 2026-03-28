/**
 * Reminder Service
 *
 * Schedules, cancels, and reconciles todo reminders using native OS notifications.
 * Pure service — no React dependency. Bridges ReminderRepository ↔ NotificationService.
 */

import { notificationService } from './tauri/notification.service';
import { reminderRepository } from './repositories/reminder.repository';
import { todosRepository } from './repositories/todos.repository';
import type { ReminderEntry, TodoReminder } from '@/types';
import { hashToNotificationId, formatReminderDate } from '@shared/utils/todo.utils';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Event emitter for "view meeting" action — App.tsx subscribes
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

    // Register action handler for todo_reminder notifications
    this.unsubscribeAction = notificationService.onActionType(
      'todo_reminder',
      (actionId, extra) => this.handleAction(actionId, extra),
    );

    // Reconcile on startup
    await this.reconcile();

    this.initialized = true;
    console.log('[ReminderService] Initialized');
  }

  /**
   * Schedule a reminder for a todo at the given datetime.
   * Persists to both the global index and the todo's reminder field.
   */
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

    // Schedule OS notification
    const scheduled = await notificationService.scheduleNotification({
      id: notificationId,
      title: meetingTitle,
      body: todoText,
      at: fireAt,
      actionTypeId: 'todo_reminder',
      extra: { todoId, meetingId },
    });

    if (!scheduled) return false;

    // Persist to global index
    const entry: ReminderEntry = {
      todoId,
      meetingId,
      todoText,
      meetingTitle,
      reminderDateTime,
      notificationId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };
    await reminderRepository.add(entry);

    // Update todo's reminder field
    const reminder: TodoReminder = { dateTime: reminderDateTime, notificationId };
    await todosRepository.updateTodo(meetingId, todoId, { reminder } as any);

    console.log(`[ReminderService] Scheduled reminder for "${todoText}" at ${formatReminderDate(reminderDateTime)}`);
    return true;
  }

  /**
   * Cancel a reminder for a todo.
   */
  async cancel(todoId: string): Promise<void> {
    const existing = await reminderRepository.getByTodoId(todoId);
    if (!existing) return;

    await notificationService.cancelNotification([existing.notificationId]);
    await reminderRepository.updateStatus(todoId, 'cancelled');

    // Clear the todo's reminder field
    await todosRepository.updateTodo(existing.meetingId, todoId, { reminder: undefined } as any);

    console.log(`[ReminderService] Cancelled reminder for todo ${todoId}`);
  }

  /**
   * Update a reminder's datetime (cancel + reschedule).
   */
  async update(todoId: string, newDateTime: string, meetingId?: string): Promise<boolean> {
    const existing = await reminderRepository.getByTodoId(todoId);
    if (!existing && !meetingId) return false;

    const params: ScheduleReminderParams = existing
      ? { ...existing, reminderDateTime: newDateTime }
      : { todoId, meetingId: meetingId!, todoText: '', meetingTitle: '', reminderDateTime: newDateTime };

    return this.schedule(params);
  }

  /**
   * Get the active reminder for a todo, if any.
   */
  async getReminder(todoId: string): Promise<ReminderEntry | null> {
    return reminderRepository.getByTodoId(todoId);
  }

  /**
   * Get all scheduled reminders.
   */
  async getAllScheduled(): Promise<ReminderEntry[]> {
    return reminderRepository.getScheduled();
  }

  /**
   * Register a handler for the "View Meeting" notification action.
   */
  onViewMeeting(handler: ViewMeetingHandler): () => void {
    viewMeetingHandler = handler;
    return () => { viewMeetingHandler = null; };
  }

  /**
   * Startup reconciliation: sync index with OS pending notifications.
   */
  private async reconcile(): Promise<void> {
    try {
      // Prune entries older than 7 days that are already fired/cancelled
      await reminderRepository.pruneStale(SEVEN_DAYS_MS);

      const scheduled = await reminderRepository.getScheduled();
      if (scheduled.length === 0) return;

      const pendingNotifs = await notificationService.getPendingNotifications();
      const pendingIds = new Set(pendingNotifs.map(n => n.id));

      for (const entry of scheduled) {
        const fireAt = new Date(entry.reminderDateTime);

        if (fireAt.getTime() <= Date.now()) {
          // Past due — mark as fired
          await reminderRepository.updateStatus(entry.todoId, 'fired');
        } else if (!pendingIds.has(entry.notificationId)) {
          // Still in the future but not in OS queue — reschedule
          await notificationService.scheduleNotification({
            id: entry.notificationId,
            title: entry.meetingTitle,
            body: entry.todoText,
            at: fireAt,
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

  /**
   * Handle notification action clicks.
   */
  private async handleAction(actionId: string, extra?: Record<string, unknown>): Promise<void> {
    const todoId = extra?.todoId as string | undefined;
    const meetingId = extra?.meetingId as string | undefined;

    if (!todoId) return;

    switch (actionId) {
      case 'view_meeting':
        if (meetingId && viewMeetingHandler) {
          viewMeetingHandler(meetingId);
        }
        await reminderRepository.updateStatus(todoId, 'fired');
        break;

      case 'snooze_15': {
        const snoozeUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const existing = await reminderRepository.getByTodoId(todoId);
        if (existing) {
          await this.schedule({ ...existing, reminderDateTime: snoozeUntil });
        }
        break;
      }

      case 'dismiss':
        await reminderRepository.updateStatus(todoId, 'fired');
        // Clear the todo's reminder field
        if (meetingId) {
          await todosRepository.updateTodo(meetingId, todoId, { reminder: undefined } as any);
        }
        break;
    }
  }

  dispose(): void {
    this.unsubscribeAction?.();
    this.initialized = false;
  }
}

export const reminderService = new ReminderService();
