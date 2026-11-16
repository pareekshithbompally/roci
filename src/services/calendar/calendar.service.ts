/** 7-day EventKit cache, reread when the calendar plugin reports a change; meeting reminders run natively. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import type { CalendarEvent, CalendarAccessStatus, EnrichedCalendarEvent } from './types';

type EventsUpdatedCallback = (events: EnrichedCalendarEvent[]) => void;

class CalendarService {
  // -- Lifecycle --
  private unlistenChanged: Promise<UnlistenFn> | null = null;
  private watching = false;
  private initialFetchDone = false;

  // -- Event cache --
  private cachedEvents: EnrichedCalendarEvent[] = [];
  private eventListeners = new Set<EventsUpdatedCallback>();

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

  // ─── Event fetching ──────────────────────────────────────────────

  async getUpcomingEvents(minutesAhead = 15): Promise<EnrichedCalendarEvent[]> {
    if (!isTauriEnvironment()) return [];
    try {
      const events = await invoke<CalendarEvent[]>(
        'plugin:calendar|get_upcoming_events',
        { minutesAhead }
      );
      return events
        .filter((e) => !e.is_all_day)
        .map((e) => this.enrichEvent(e));
    } catch (error: unknown) {
      console.error('[CalendarService] getUpcomingEvents failed:', error);
      return [];
    }
  }

  async getEventsInRange(start: string, end: string): Promise<EnrichedCalendarEvent[]> {
    if (!isTauriEnvironment()) return [];
    try {
      const events = await invoke<CalendarEvent[]>(
        'plugin:calendar|get_events_in_range',
        { start, end }
      );
      return events.map((e) => this.enrichEvent(e));
    } catch (error: unknown) {
      console.error('[CalendarService] getEventsInRange failed:', error);
      return [];
    }
  }

  // ─── Event cache (for UI consumption) ────────────────────────────

  getCachedEvents(): EnrichedCalendarEvent[] {
    return this.cachedEvents;
  }

  isWatching(): boolean {
    return this.watching;
  }

  hasInitialFetchDone(): boolean {
    return this.initialFetchDone;
  }

  onEventsUpdated(callback: EventsUpdatedCallback): () => void {
    this.eventListeners.add(callback);
    if (this.cachedEvents.length > 0) {
      callback(this.cachedEvents);
    }
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  async forceRefresh(): Promise<void> {
    await this.refreshCache();
  }

  // ─── Watching ────────────────────────────────────────────────────

  /** Reads now, then rereads on every `calendar://changed` until stopped. */
  startWatching(): void {
    this.stopListening();

    this.watching = true;
    this.initialFetchDone = false;

    for (const listener of this.eventListeners) {
      listener(this.cachedEvents);
    }

    void this.refreshCache();
    this.unlistenChanged = listen(CALENDAR_CONFIG.changedEvent, () => void this.refreshCache());
    this.unlistenChanged.catch((error: unknown) =>
      console.error('[CalendarService] Listening for calendar changes failed:', error));
  }

  stopWatching(): void {
    this.stopListening();
    this.watching = false;
    this.initialFetchDone = false;
    this.cachedEvents = [];
    for (const listener of this.eventListeners) {
      listener([]);
    }
  }

  // ─── Internal: cache refresh ─────────────────────────────────────

  private async refreshCache(): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getTime() + CALENDAR_CONFIG.lookaheadDays * 86_400_000);
    const events = await this.getEventsInRange(startOfDay.toISOString(), end.toISOString());
    // Stopped while reading: the integration is off, so the cache stays empty.
    if (!this.watching) return;

    this.cachedEvents = events;
    this.initialFetchDone = true;

    for (const listener of this.eventListeners) {
      listener(this.cachedEvents);
    }
  }

  private stopListening(): void {
    const unlisten = this.unlistenChanged;
    this.unlistenChanged = null;
    unlisten?.then((stop) => stop()).catch(() => undefined);
  }

  // ─── Internal: helpers ───────────────────────────────────────────

  private enrichEvent(event: CalendarEvent): EnrichedCalendarEvent {
    const activeParticipants = event.attendees.filter(
      (a) => a.status !== 'declined'
    );
    return { ...event, active_participant_count: activeParticipants.length };
  }
}

export const calendarService = new CalendarService();
