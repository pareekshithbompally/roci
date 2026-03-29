/**
 * Calendar Service
 *
 * Bridges macOS EventKit (via Tauri plugin) with the frontend.
 * Uses a dual-timer architecture:
 *   1. Cache refresh (every CALENDAR_CONFIG.cacheRefreshIntervalMs) — fetches 7-day
 *      lookahead from EventKit and stores enriched events in-memory.
 *   2. Notification check (every CALENDAR_CONFIG.notificationCheckIntervalMs) — scans
 *      the cached events for approaching meetings and fires callbacks.
 *
 * UI components subscribe to cache updates via onEventsUpdated().
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../tauri/environment.service';
import { extractMeetingUrl } from './meeting-url';
import { CALENDAR_CONFIG } from '../../src/config/calendar.config';
import type {
  CalendarEvent,
  CalendarAccessStatus,
  EnrichedCalendarEvent,
  CalendarIntegrationSettings,
} from './types';
import { CALENDAR_DEFAULTS } from './types';

/** Callback signature for upcoming meeting events. */
type MeetingApproachingCallback = (event: EnrichedCalendarEvent) => void;

/** Callback signature for cache update subscribers. */
type EventsUpdatedCallback = (events: EnrichedCalendarEvent[]) => void;

class CalendarService {
  // -- Timers --
  private cacheRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private notificationCheckTimer: ReturnType<typeof setInterval> | null = null;

  // -- Notification state --
  private notifiedEventIds = new Set<string>();
  private snoozedUntilStart = new Set<string>();
  private onMeetingApproaching: MeetingApproachingCallback | null = null;

  // -- Event cache --
  private cachedEvents: EnrichedCalendarEvent[] = [];
  private eventListeners = new Set<EventsUpdatedCallback>();

  // -- Settings --
  private settings: CalendarIntegrationSettings = { ...CALENDAR_DEFAULTS };

  // ─── Access management ───────────────────────────────────────────

  /** Request calendar permission. Triggers macOS system dialog. */
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

  /** Check current authorization status without prompting. */
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

  /** Fetch upcoming events from EventKit and enrich with derived fields. */
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

  /** Fetch events in a date range. */
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

  /** Get the current cached events snapshot. */
  getCachedEvents(): EnrichedCalendarEvent[] {
    return this.cachedEvents;
  }

  /** Subscribe to cache updates. Returns an unsubscribe function. */
  onEventsUpdated(callback: EventsUpdatedCallback): () => void {
    this.eventListeners.add(callback);
    // Immediately fire with current cache if populated
    if (this.cachedEvents.length > 0) {
      callback(this.cachedEvents);
    }
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  /** Trigger an immediate cache refresh (e.g., from a Sync button). */
  async forceRefresh(): Promise<void> {
    await this.refreshCache();
  }

  // ─── Polling ─────────────────────────────────────────────────────

  /** Register a callback for when a meeting is approaching. */
  onMeetingStarting(callback: MeetingApproachingCallback): () => void {
    this.onMeetingApproaching = callback;
    return () => {
      this.onMeetingApproaching = null;
    };
  }

  /** Start polling with dual timers: cache refresh + notification check. */
  startPolling(settings?: CalendarIntegrationSettings): void {
    if (settings) this.settings = settings;
    if (!this.settings.enabled) return;

    this.stopPolling();

    // Immediate cache refresh, then on interval
    this.refreshCache();
    this.cacheRefreshTimer = setInterval(
      () => this.refreshCache(),
      CALENDAR_CONFIG.cacheRefreshIntervalMs
    );

    // Notification checks run on a faster cadence against the cache
    this.notificationCheckTimer = setInterval(
      () => this.checkUpcomingMeetingsFromCache(),
      CALENDAR_CONFIG.notificationCheckIntervalMs
    );

    console.log('[CalendarService] Polling started (cache refresh: %dms, notification check: %dms)',
      CALENDAR_CONFIG.cacheRefreshIntervalMs,
      CALENDAR_CONFIG.notificationCheckIntervalMs
    );
  }

  /** Stop all polling timers. */
  stopPolling(): void {
    if (this.cacheRefreshTimer) {
      clearInterval(this.cacheRefreshTimer);
      this.cacheRefreshTimer = null;
    }
    if (this.notificationCheckTimer) {
      clearInterval(this.notificationCheckTimer);
      this.notificationCheckTimer = null;
    }
    console.log('[CalendarService] Polling stopped');
  }

  /** Update settings and restart polling if needed. */
  updateSettings(settings: CalendarIntegrationSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = settings;

    if (settings.enabled && !wasEnabled) {
      this.startPolling();
    } else if (!settings.enabled && wasEnabled) {
      this.stopPolling();
    }
  }

  /** Clear notification tracking (e.g., on new day or settings change). */
  clearNotificationHistory(): void {
    this.notifiedEventIds.clear();
    this.snoozedUntilStart.clear();
  }

  /** Mark an event as snoozed — will re-notify at meeting start time. */
  snoozeEvent(eventId: string): void {
    this.notifiedEventIds.delete(eventId);
    this.snoozedUntilStart.add(eventId);
  }

  // ─── Internal: cache refresh ─────────────────────────────────────

  private async refreshCache(): Promise<void> {
    // Start from beginning of today so past events from today still show on the calendar
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getTime() + CALENDAR_CONFIG.lookaheadDays * 86_400_000);
    const events = await this.getEventsInRange(startOfDay.toISOString(), end.toISOString());

    this.cachedEvents = events;
    console.log('[CalendarService] Cache refreshed: %d events', events.length);

    // Notify UI subscribers
    for (const listener of this.eventListeners) {
      listener(this.cachedEvents);
    }
  }

  // ─── Internal: notification check (reads from cache, not EventKit) ──

  private checkUpcomingMeetingsFromCache(): void {
    if (!this.onMeetingApproaching) return;

    const now = Date.now();
    const notifyBefore = this.settings.notify_minutes_before;
    const snoozeThresholdMinutes = CALENDAR_CONFIG.snoozeThresholdSeconds / 60;

    for (const event of this.cachedEvents) {
      if (this.shouldSkipEvent(event)) continue;

      const startMs = new Date(event.start_date).getTime();
      const minsUntilStart = (startMs - now) / 60_000;

      // For snoozed events, only notify within the snooze threshold of start
      if (this.snoozedUntilStart.has(event.event_id)) {
        if (minsUntilStart > snoozeThresholdMinutes) continue;
        this.snoozedUntilStart.delete(event.event_id);
      }

      if (minsUntilStart <= notifyBefore && minsUntilStart > CALENDAR_CONFIG.notificationGracePeriodMinutes) {
        this.notifiedEventIds.add(event.event_id);
        this.onMeetingApproaching(event);
      }
    }
  }

  // ─── Internal: helpers ───────────────────────────────────────────

  private shouldSkipEvent(event: EnrichedCalendarEvent): boolean {
    if (event.is_all_day) return true;
    if (this.notifiedEventIds.has(event.event_id)) return true;

    // Skip events where the current user has declined
    const currentUserDeclined = event.attendees.some(
      (a) => a.is_current_user === true && a.status === 'declined'
    );
    if (currentUserDeclined) return true;

    return false;
  }

  private enrichEvent(event: CalendarEvent): EnrichedCalendarEvent {
    const meetingUrl = extractMeetingUrl(event);
    const activeParticipants = event.attendees.filter(
      (a) => a.status !== 'declined'
    );

    return {
      ...event,
      meeting_url: meetingUrl,
      active_participant_count: activeParticipants.length,
    };
  }
}

export const calendarService = new CalendarService();
