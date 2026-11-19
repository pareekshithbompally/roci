/** To-do reminders as native timed notifications, persisted in roci.db so launch re-arms the ones still ahead. */

import { MS_PER_MINUTE } from '@shared/utils/localDate';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { TODOS_CONFIG } from '@config/todos.config';
import { askNotificationsOnFirstUse, onNotificationResponse, removeNotices, scheduleNotice, type Notice } from '@services/notifications';
import { store } from './db';
import type { ReminderEntry } from '@shared/types';
import { hashToNotificationId, formatReminderDate } from '@shared/utils/todo.utils';
import { platform } from '@platform/index';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TODO = NOTIFICATIONS_CONFIG.todo;

type ViewMeetingHandler = (meetingId: string) => void;
let viewMeetingHandler: ViewMeetingHandler | null = null;

export interface ScheduleReminderParams {
  todoId: string;
  /** The meeting it came from; null for a to-do of its own (the notice then has no View Meeting). */
  meetingId: string | null;
  todoText: string;
  meetingTitle: string | null;
  reminderDateTime: string; // ISO 8601
}

const noticeId = (todoId: string) => `${TODO.idPrefix}${todoId}`;

function reminderNotice({ todoId, meetingId, todoText, meetingTitle }: ScheduleReminderParams): Notice {
  const body = todoText.length > TODO.bodyMaxChars ? `${todoText.slice(0, TODO.bodyMaxChars - 1)}…` : todoText;
  return {
    id: noticeId(todoId),
    title: meetingTitle ?? TODOS_CONFIG.general,
    body,
    category: meetingId ? TODO.category : TODO.generalCategory,
    userInfo: meetingId ? { todoId, meetingId } : { todoId },
    kind: 'todoReminders',
  };
}

class ReminderService {
  private unsubscribeResponse: (() => void) | null = null;

  async initialize(): Promise<void> {
    if (this.unsubscribeResponse) return;
    this.unsubscribeResponse = onNotificationResponse((response) => {
      if (!response.id.startsWith(TODO.idPrefix)) return;
      this.handleAction(response.action, response.userInfo).catch((error: unknown) =>
        console.error('[ReminderService] Action failed:', error),
      );
    });
    await this.reconcile();
  }

  async schedule(params: ScheduleReminderParams): Promise<boolean> {
    if (!platform.hasNotifications) return false;
    const fireAt = new Date(params.reminderDateTime);
    if (fireAt.getTime() <= Date.now()) {
      console.warn('[ReminderService] Cannot schedule reminder in the past');
      return false;
    }
    // Setting a reminder is the first use of notifications on a device that didn't ask during setup.
    await askNotificationsOnFirstUse();
    await scheduleNotice(reminderNotice(params), fireAt);
    await store.reminders.upsert(params.todoId, hashToNotificationId(params.todoId), fireAt.getTime());
    console.log(`[ReminderService] Scheduled reminder at ${formatReminderDate(params.reminderDateTime)}`);
    return true;
  }

  async cancel(todoId: string): Promise<void> {
    if (platform.hasNotifications) await removeNotices([noticeId(todoId)]);
    try {
      await store.reminders.setStatus(todoId, 'cancelled');
    } catch {
      // reminder may not exist in DB
    }
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

  /** Launch: re-arm reminders still ahead, so macOS holds exactly what the database does (same id replaces). */
  private async reconcile(): Promise<void> {
    try {
      await store.reminders.prune(SEVEN_DAYS_MS);
      for (const entry of await store.reminders.due()) {
        const fireAt = new Date(entry.reminderDateTime);
        if (fireAt.getTime() <= Date.now()) {
          await store.reminders.setStatus(entry.todoId, 'fired');
        } else {
          await scheduleNotice(reminderNotice(entry), fireAt);
        }
      }
    } catch (error: unknown) {
      console.error('[ReminderService] Reconciliation failed:', error);
    }
  }

  private async handleAction(action: string, info: Record<string, string>): Promise<void> {
    const { todoId, meetingId } = info;
    if (!todoId) return;

    if (action === TODO.actions.snooze) {
      const existing = await this.getReminder(todoId);
      const snoozeUntil = new Date(Date.now() + TODO.snoozeMinutes * MS_PER_MINUTE).toISOString();
      if (existing) await this.schedule({ ...existing, reminderDateTime: snoozeUntil });
      return;
    }
    if (action === TODO.actions.viewMeeting && meetingId) viewMeetingHandler?.(meetingId);
    await store.reminders.setStatus(todoId, 'fired');
  }

  dispose(): void {
    this.unsubscribeResponse?.();
    this.unsubscribeResponse = null;
  }
}

export const reminderService = new ReminderService();
