/**
 * Calendar Service
 *
 * Bridges macOS EventKit (via Tauri plugin) with the frontend.
 *
 * Architecture:
 *   1. Cache refresh (every 2 min) — fetches 7-day lookahead from EventKit,
 *      stores enriched events in-memory.
 *   2. OS-level notification scheduling — delegates to NotificationScheduler
 *      which uses macOS UNUserNotificationCenter for reliable timing.
 *      No setTimeout. No polling for notification delivery.
 *   3. On each cache refresh, old calendar notifications are canceled and
 *      rescheduled for current events. This handles start-time changes,
 *      cancellations, and new events atomically.
 *
 *   UI components subscribe to cache updates via onEventsUpdated().
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import { notificationScheduler } from '@services/notification-scheduler';
import { extractMeetingUrl } from './meeting-url';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import type {
  CalendarEvent,
  CalendarAccessStatus,
  EnrichedCalendarEvent,
  CalendarIntegrationSettings,
} from './types';
import { CALENDAR_DEFAULTS } from './types';

type EventsUpdatedCallback = (events: EnrichedCalendarEvent[]) => void;

/**
 * Action type for bare OS-scheduled calendar notifications.
 * These fire at the target time. When the user clicks, notification-handler
 * intercepts and shows an *actionable* notification via notifyWithActions()
 * (which uses 'meeting_starting' / 'meeting_starting_no_url').
 */
const CAL_OS_ACTION_TYPE = 'calendar_event';

function calKey(eventId: string): string {
  return `cal:${eventId}`;
}

class CalendarService {
  // -- Timers --
  private cacheRefreshTimer: ReturnType<typeof setInterval> | null = null;

  // -- Lifecycle --
  private pollingActive = false;
  private initialFetchDone = false;

  // -- Notification state (tracks what has been notified this session) --
  private notifiedEventIds = new Set<string>();
  private snoozedUntilStart = new Set<string>();

  // -- Event cache --
  private cachedEvents: EnrichedCalendarEvent[] = [];
  private eventListeners = new Set<EventsUpdatedCallback>();

  // -- Settings --
  private settings: CalendarIntegrationSettings = { ...CALENDAR_DEFAULTS };

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

  isPollingActive(): boolean {
    return this.pollingActive;
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

  // ─── Polling ─────────────────────────────────────────────────────

  startPolling(settings?: CalendarIntegrationSettings): void {
    if (settings) this.settings = settings;
    if (!this.settings.enabled) return;

    this.stopPollingTimer();

    this.pollingActive = true;
    this.initialFetchDone = false;

    for (const listener of this.eventListeners) {
      listener(this.cachedEvents);
    }

    this.refreshCache();
    this.cacheRefreshTimer = setInterval(
      () => this.refreshCache(),
      CALENDAR_CONFIG.cacheRefreshIntervalMs
    );

    console.log('[CalendarService] Polling started (OS-scheduled notifications, cache: %dms)',
      CALENDAR_CONFIG.cacheRefreshIntervalMs
    );
  }

  stopPolling(): void {
    this.stopPollingTimer();
    this.pollingActive = false;
    this.initialFetchDone = false;
    this.clearScheduledNotifications();
    this.cachedEvents = [];
    for (const listener of this.eventListeners) {
      listener([]);
    }
  }

  updateSettings(settings: CalendarIntegrationSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = settings;

    if (settings.enabled && !wasEnabled) {
      this.startPolling();
    } else if (!settings.enabled && wasEnabled) {
      this.stopPolling();
    } else if (settings.enabled && wasEnabled) {
      this.clearNotificationHistory();
      this.startPolling();
    }
  }

  clearNotificationHistory(): void {
    this.notifiedEventIds.clear();
    this.snoozedUntilStart.clear();
    this.clearScheduledNotifications();
    this.scheduleNotifications();
  }

  snoozeEvent(eventId: string): void {
    this.notifiedEventIds.delete(eventId);
    // Cancel existing OS-scheduled notification for this event
    notificationScheduler.cancel(calKey(eventId));
    this.snoozedUntilStart.add(eventId);
    this.scheduleNotifications();
  }

  /** Look up an event from the cache by ID (for notification click handlers). */
  getEventById(eventId: string): EnrichedCalendarEvent | undefined {
    return this.cachedEvents.find((e) => e.event_id === eventId);
  }

  // ─── Internal: cache refresh ─────────────────────────────────────

  private async refreshCache(): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getTime() + CALENDAR_CONFIG.lookaheadDays * 86_400_000);
    const events = await this.getEventsInRange(startOfDay.toISOString(), end.toISOString());

    this.cachedEvents = events;
    this.initialFetchDone = true;

    this.scheduleNotifications();

    for (const listener of this.eventListeners) {
      listener(this.cachedEvents);
    }
  }

  private stopPollingTimer(): void {
    if (this.cacheRefreshTimer) {
      clearInterval(this.cacheRefreshTimer);
      this.cacheRefreshTimer = null;
    }
  }

  // ─── Internal: OS-level notification scheduling ─────────────────

  /**
   * Schedule OS notifications for all upcoming events that need one.
   * Cancels all existing calendar notifications first, then reschedules
   * for current events. Called by refreshCache() every 2 minutes.
   */
  private scheduleNotifications(): void {
    const now = Date.now();
    const notifyBeforeMs = this.settings.notify_minutes_before * 60_000;
    const snoozeThresholdMs = CALENDAR_CONFIG.snoozeThresholdSeconds * 1_000;

    if (this.cachedEvents.length === 0) return;

    let scheduled = 0;

    for (const event of this.cachedEvents) {
      if (this.shouldSkipEvent(event)) continue;

      const startMs = new Date(event.start_date).getTime();
      const minsUntilStart = (startMs - now) / 60_000;

      if (minsUntilStart <= CALENDAR_CONFIG.notificationGracePeriodMinutes) continue;

      const key = calKey(event.event_id);

      let fireAtMs: number;

      if (this.snoozedUntilStart.has(event.event_id)) {
        // Snoozed: re-notify at (start - snooze threshold)
        fireAtMs = startMs - snoozeThresholdMs;
        this.snoozedUntilStart.delete(event.event_id);
      } else {
        // Normal: fire at (start - notifyBefore)
        fireAtMs = startMs - notifyBeforeMs;
      }

      if (fireAtMs <= now) {
        // Missed window but still within grace period — fire immediately
        // by emitting the event (notification-handler shows actionable notif)
        this.fireImmediate(event);
        continue;
      }

      notificationScheduler.schedule(key, {
        at: new Date(fireAtMs),
        title: event.title,
        body: `Meeting at ${new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        actionTypeId: CAL_OS_ACTION_TYPE,
        extra: {
          event_id: event.event_id,
          meeting_url: event.meeting_url ?? '',
        },
      });

      scheduled++;
    }

    if (scheduled > 0) {
      console.log('[CalendarService] OS-scheduled %d notification(s)', scheduled);
    }
  }

  /**
   * Fire notification immediately for events that just missed the window
   * but are still within the grace period. Delegate to the existing
   * notification-handler callback (if registered).
   *
   * Since we no longer have onMeetingApproaching, we schedule an
   * OS notification at "now" — the OS delivers it immediately.
   * The notification-handler's onAction interceptor picks it up.
   */
  private fireImmediate(event: EnrichedCalendarEvent): void {
    if (this.notifiedEventIds.has(event.event_id)) return;
    this.notifiedEventIds.add(event.event_id);

    notificationScheduler.schedule(calKey(event.event_id), {
      at: new Date(Date.now() + 1000),
      title: event.title,
      body: `Meeting at ${new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      actionTypeId: CAL_OS_ACTION_TYPE,
      extra: {
        event_id: event.event_id,
        meeting_url: event.meeting_url ?? '',
      },
    });
  }

  private clearScheduledNotifications(): void {
    notificationScheduler.cancelAllForType(CAL_OS_ACTION_TYPE);
  }

  // ─── Internal: helpers ───────────────────────────────────────────

  private shouldSkipEvent(event: EnrichedCalendarEvent): boolean {
    if (event.is_all_day) return true;
    if (this.notifiedEventIds.has(event.event_id)) return true;

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
