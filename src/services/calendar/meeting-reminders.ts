/** Meeting reminders: Rust times and posts them; the webview sends on/lead time and starts recording on Record. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import type { CalendarEvent } from './types';

/** Calendar reading (menu bar next meeting, call detection) and native reminders on/off, and the reminders' lead time. */
export async function configureMeetingReminders(calendar: boolean, enabled: boolean, leadMinutes: number): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke('configure_meeting_reminders', { calendar, enabled, leadMinutes });
}

/** Record (or Join & Record: the call link opens first) `event` from the app's calendar, the same way as from a reminder. */
export async function recordCalendarEvent(event: CalendarEvent, join: boolean): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke('record_calendar_event', { event, join });
}

/** Record or Join & record was chosen on a reminder: start recording `event`. Returns the unsubscribe. */
export function onMeetingRecord(handler: (event: CalendarEvent) => void): () => void {
  if (!isTauriEnvironment()) return () => undefined;
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<CalendarEvent>(CALENDAR_CONFIG.reminderRecordEvent, ({ payload }) => handler(payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((error: unknown) => console.error('[MeetingReminders] listen failed:', error));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
