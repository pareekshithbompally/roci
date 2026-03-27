/**
 * Calendar Service
 *
 * Bridges macOS EventKit (via Tauri plugin) with the frontend.
 * Handles polling for upcoming meetings, enriching events with
 * derived fields (meeting URL), and scheduling notifications.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../tauri/environment.service';
import { extractMeetingUrl } from './meeting-url';
import type {
  CalendarEvent,
  CalendarAccessStatus,
  EnrichedCalendarEvent,
  CalendarIntegrationSettings,
} from './types';
import { CALENDAR_DEFAULTS } from './types';

/** Callback signature for upcoming meeting events. */
type MeetingApproachingCallback = (event: EnrichedCalendarEvent) => void;

class CalendarService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private notifiedEventIds = new Set<string>();
  private snoozedUntilStart = new Set<string>();
  private onMeetingApproaching: MeetingApproachingCallback | null = null;
  private settings: CalendarIntegrationSettings = { ...CALENDAR_DEFAULTS };

  // -- Access management --

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

  // -- Event fetching --

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

  // -- Polling --

  /** Register a callback for when a meeting is approaching. */
  onMeetingStarting(callback: MeetingApproachingCallback): () => void {
    this.onMeetingApproaching = callback;
    return () => {
      this.onMeetingApproaching = null;
    };
  }

  /** Start polling for upcoming meetings. */
  startPolling(settings?: CalendarIntegrationSettings): void {
    if (settings) this.settings = settings;
    if (!this.settings.enabled) return;

    this.stopPolling();
    this.checkUpcomingMeetings();
    this.pollTimer = setInterval(() => this.checkUpcomingMeetings(), 60_000);
    console.log('[CalendarService] Polling started');
  }

  /** Stop polling. */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log('[CalendarService] Polling stopped');
    }
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

  // -- Internal --

  private async checkUpcomingMeetings(): Promise<void> {
    if (!this.onMeetingApproaching) return;

    const notifyBefore = this.settings.notify_minutes_before;
    const events = await this.getUpcomingEvents(notifyBefore + 1);
    const now = Date.now();

    for (const event of events) {
      if (this.shouldSkipEvent(event)) continue;

      const startMs = new Date(event.start_date).getTime();
      const minsUntilStart = (startMs - now) / 60_000;

      // For snoozed events, only notify within 30 seconds of start
      if (this.snoozedUntilStart.has(event.event_id)) {
        if (minsUntilStart > 0.5) continue;
        this.snoozedUntilStart.delete(event.event_id);
      }

      if (minsUntilStart <= notifyBefore && minsUntilStart > -5) {
        this.notifiedEventIds.add(event.event_id);
        this.onMeetingApproaching(event);
      }
    }
  }

  private shouldSkipEvent(event: EnrichedCalendarEvent): boolean {
    if (event.is_all_day) return true;
    if (this.notifiedEventIds.has(event.event_id)) return true;

    // Skip events where the user has declined
    const userDeclined = event.attendees.some(
      (a) => a.is_organizer === false && a.status === 'declined'
    );
    // Only skip if there are attendees and we found a decline — don't skip
    // events with no attendee list (personal events)
    if (event.attendees.length > 0 && userDeclined) {
      // Heuristic: if the current user explicitly declined, skip.
      // EKParticipant doesn't reliably expose "current user" in all cases,
      // so we rely on the organizer flag. For now, don't skip — this is
      // conservative. A future improvement can use the Contacts API.
    }

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
