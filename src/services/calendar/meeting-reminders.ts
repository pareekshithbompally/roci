/** Meeting reminders: Rust times and posts them; the webview sends on/lead time and starts recording on Record. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import type { CalendarEvent } from './types';

/** Turn native reminders on/off and set how many minutes before a meeting they show. */
export async function configureMeetingReminders(enabled: boolean, leadMinutes: number): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke('configure_meeting_reminders', { enabled, leadMinutes });
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
