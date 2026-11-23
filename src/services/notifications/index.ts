/** Forwards to `tauri-plugin-notifications` (timed notices are handed to macOS with their time); answers via `onNotificationResponse`. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import type { NotificationKind } from '@shared/types';

export type NotificationStatus = 'authorized' | 'denied' | 'not_determined' | 'unsupported';

export interface Notice {
  /** Reusing an id replaces the earlier notice; `removeNotices` withdraws it. */
  id: string;
  title: string;
  body: string;
  /** Button set (`NOTIFICATION_CATEGORIES`). */
  category?: string;
  userInfo?: Record<string, string>;
  /** The Settings › Notifications switch that governs it; none = always shown. */
  kind?: NotificationKind;
}

export interface NotificationResponse {
  id: string;
  /** A button id, `open` (banner clicked) or `dismiss`. */
  action: string;
  userInfo: Record<string, string>;
}

const call = <T = void>(command: string, args?: Record<string, unknown>): Promise<T> =>
  invoke<T>(`plugin:notifications|${command}`, args);

export async function notificationStatus(): Promise<NotificationStatus> {
  if (!isTauriEnvironment()) return 'unsupported';
  return call<NotificationStatus>('status');
}

/** Raise the macOS prompt (only while undecided); resolves the status after it (a denial is an answer, not an error). */
export async function requestNotifications(): Promise<NotificationStatus> {
  if (!isTauriEnvironment()) return 'unsupported';
  return call<NotificationStatus>('request');
}

export async function postNotice(notice: Notice): Promise<void> {
  if (!isTauriEnvironment()) return;
  await call('post', { notice });
}

/** Asks the first time the user turns on something that notifies (the system prompts only while undecided), as Apple
 *  advises; call it from that user action, never at launch. */
export async function askNotificationsOnFirstUse(): Promise<void> {
  if ((await notificationStatus()) === 'not_determined') await requestNotifications();
}

/** The system delivers it at `at` (wall clock), even while Roci is idle; replaces any timed notice with the same id. */
export async function scheduleNotice(notice: Notice, at: Date): Promise<void> {
  if (!isTauriEnvironment()) return;
  await call('schedule', { notice, atMs: at.getTime() });
}

export async function removeNotices(ids: string[]): Promise<void> {
  if (!isTauriEnvironment()) return;
  await call('remove', { ids });
}

export async function addNotificationCategories(
  categories: ReadonlyArray<{ id: string; actions: ReadonlyArray<{ id: string; title: string }> }>,
): Promise<void> {
  if (!isTauriEnvironment()) return;
  await call('add_categories', { categories });
}

/** Kinds switched off in Settings › Notifications. */
export async function setMutedNotifications(kinds: NotificationKind[]): Promise<void> {
  if (!isTauriEnvironment()) return;
  await call('set_muted', { kinds });
}

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauriEnvironment()) return () => undefined;
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<T>(event, ({ payload }) => handler(payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((error: unknown) => console.error(`[Notifications] listen ${event} failed:`, error));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** Every answer; handlers check the id prefix they own. Returns the unsubscribe. */
export const onNotificationResponse = (handler: (response: NotificationResponse) => void) =>
  subscribe(NOTIFICATIONS_CONFIG.events.response, handler);
