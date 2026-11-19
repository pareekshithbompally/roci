/** EventKit access and range reads, and the native `calendar://changed` signal; the UI caches reads in Query (useRangeEvents). */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import type { CalendarEvent, CalendarAccessStatus } from './types';

class CalendarService {
  // ─── Access management ───────────────────────────────────────────

  async requestAccess(): Promise<boolean> {
    if (!isTauriEnvironment()) return false;
    try {
      const result = await invoke<{ granted: boolean; error?: string }>(
        'plugin:calendar|request_access'
      );
      return result.granted;
    } catch (error: unknown) {
      console.error('[CalendarService] requestAccess failed:', error);
      return false;
    }
  }

  async checkAccess(): Promise<CalendarAccessStatus> {
    if (!isTauriEnvironment()) return 'not_determined';
    try {
      const result = await invoke<{ status: CalendarAccessStatus }>(
        'plugin:calendar|check_access'
      );
      return result.status;
    } catch (error: unknown) {
      console.error('[CalendarService] checkAccess failed:', error);
      return 'not_determined';
    }
  }

  // ─── Event reading ─────────────────────────────────────────────

  async getEventsInRange(start: string, end: string): Promise<CalendarEvent[]> {
    if (!isTauriEnvironment()) return [];
    try {
      return await invoke<CalendarEvent[]>('plugin:calendar|get_events_in_range', { start, end });
    } catch (error: unknown) {
      console.error('[CalendarService] getEventsInRange failed:', error);
      return [];
    }
  }

  /** `calendar://changed` (EventKit change, new day, clock change, wake) runs `handler`; returns the unsubscribe. */
  onCalendarChanged(handler: () => void): () => void {
    if (!isTauriEnvironment()) return () => undefined;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    listen(CALENDAR_CONFIG.changedEvent, handler)
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch((error: unknown) => console.error('[CalendarService] Listening for calendar changes failed:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }
}

export const calendarService = new CalendarService();
