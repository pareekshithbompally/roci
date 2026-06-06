/**
 * Calendar Service
 *
 * Bridges macOS EventKit (via Tauri plugin) with the frontend.
 * Architecture:
 *   1. Cache refresh (every CALENDAR_CONFIG.cacheRefreshIntervalMs) — fetches 7-day
 *      lookahead from EventKit and stores enriched events in-memory.
 *   2. Precise notification scheduling — after each cache refresh, schedules exact
 *      setTimeout for each upcoming meeting at (start - notifyBefore). This ensures
 *      notifications fire on time regardless of polling cadence.
 *
 * UI components subscribe to cache updates via onEventsUpdated().
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../tauri/environment.service';
import { extractMeetingUrl } from './meeting-url';
import { CALENDAR_CONFIG } from '@config/calendar.config';
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
  /** Precise per-event notification timeouts (event_id → timer) */
  private scheduledNotifications = new Map<string, ReturnType<typeof setTimeout>>();

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

  /** Start polling with cache refresh + precise notification scheduling. */
  startPolling(settings?: CalendarIntegrationSettings): void {
    if (settings) this.settings = settings;
    if (!this.settings.enabled) return;

    this.stopPolling();

    // Immediate cache refresh (also schedules notifications), then on interval
    this.refreshCache();
    this.cacheRefreshTimer = setInterval(
      () => this.refreshCache(),
      CALENDAR_CONFIG.cacheRefreshIntervalMs
    );

    console.log('[CalendarService] Polling started (cache refresh: %dms, precise notification scheduling)',
      CALENDAR_CONFIG.cacheRefreshIntervalMs
    );
  }

  /** Stop all polling timers and scheduled notifications. */
  stopPolling(): void {
    if (this.cacheRefreshTimer) {
      clearInterval(this.cacheRefreshTimer);
      this.cacheRefreshTimer = null;
    }
    this.clearScheduledNotifications();
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

  /** Clear notification tracking and re-schedule (e.g., on settings change). */
  clearNotificationHistory(): void {
    this.notifiedEventIds.clear();
    this.snoozedUntilStart.clear();
    this.clearScheduledNotifications();
    // Re-schedule with clean state
    this.scheduleNotifications();
  }

  /** Mark an event as snoozed — will re-notify at meeting start time. */
  snoozeEvent(eventId: string): void {
    this.notifiedEventIds.delete(eventId);
    // Clear existing timer if any, then re-schedule as snoozed
    const existing = this.scheduledNotifications.get(eventId);
    if (existing) {
      clearTimeout(existing);
      this.scheduledNotifications.delete(eventId);
    }
    this.snoozedUntilStart.add(eventId);
    this.scheduleNotifications();
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

    // Schedule precise notifications for upcoming events
    this.scheduleNotifications();

    // Notify UI subscribers
    for (const listener of this.eventListeners) {
      listener(this.cachedEvents);
    }
  }

  // ─── Internal: precise notification scheduling ──────────────────

  /**
   * Schedule exact setTimeout for each upcoming event based on its start time
   * minus the user's notify-before setting. This replaces the old 1-minute
   * polling interval and guarantees notifications fire on time.
   */
  private scheduleNotifications(): void {
    if (!this.onMeetingApproaching) return;

    const now = Date.now();
    const notifyBeforeMs = this.settings.notify_minutes_before * 60_000;
    const graceMs = CALENDAR_CONFIG.notificationGracePeriodMinutes * 60_000;
    const snoozeThresholdMs = CALENDAR_CONFIG.snoozeThresholdSeconds * 1_000;

    // Clear stale timers for events no longer in cache
    const currentEventIds = new Set(this.cachedEvents.map(e => e.event_id));
    for (const [eventId, timer] of this.scheduledNotifications) {
      if (!currentEventIds.has(eventId)) {
        clearTimeout(timer);
        this.scheduledNotifications.delete(eventId);
      }
    }

    for (const event of this.cachedEvents) {
      if (this.shouldSkipEvent(event)) continue;
      // Don't re-schedule if already scheduled
      if (this.scheduledNotifications.has(event.event_id)) continue;

      const startMs = new Date(event.start_date).getTime();
      const minsUntilStart = (startMs - now) / 60_000;

      // Already past grace period — skip
      if (minsUntilStart <= CALENDAR_CONFIG.notificationGracePeriodMinutes) continue;

      // For snoozed events: schedule at (start - snooze threshold)
      if (this.snoozedUntilStart.has(event.event_id)) {
        const fireAt = startMs - snoozeThresholdMs;
        const delayMs = fireAt - now;
        if (delayMs <= 0) {
          // Fire immediately
          this.snoozedUntilStart.delete(event.event_id);
          this.fireNotification(event);
        } else {
          this.scheduledNotifications.set(
            event.event_id,
            setTimeout(() => {
              this.snoozedUntilStart.delete(event.event_id);
              this.fireNotification(event);
            }, delayMs)
          );
        }
        continue;
      }

      // Normal event: fire at (start - notifyBefore)
      const fireAt = startMs - notifyBeforeMs;
      const delayMs = fireAt - now;

      if (delayMs <= 0 && minsUntilStart > CALENDAR_CONFIG.notificationGracePeriodMinutes) {
        // Should have already fired (e.g., app just opened) — fire now
        this.fireNotification(event);
      } else if (delayMs > 0) {
        console.log('[CalendarService] Scheduled notification for "%s" in %ds',
          event.title, Math.round(delayMs / 1000));
        this.scheduledNotifications.set(
          event.event_id,
          setTimeout(() => this.fireNotification(event), delayMs)
        );
      }
    }
  }

  /** Fire a notification for an approaching event. */
  private fireNotification(event: EnrichedCalendarEvent): void {
    this.scheduledNotifications.delete(event.event_id);
    if (this.notifiedEventIds.has(event.event_id)) return;
    this.notifiedEventIds.add(event.event_id);
    this.onMeetingApproaching?.(event);
  }

  /** Clear all scheduled notification timeouts. */
  private clearScheduledNotifications(): void {
    for (const timer of this.scheduledNotifications.values()) {
      clearTimeout(timer);
    }
    this.scheduledNotifications.clear();
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
