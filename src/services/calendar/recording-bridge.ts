/**
 * Calendar-Recording Bridge
 *
 * Stores the calendar event for the next recording session.
 * Since only one recording can be active at a time, this is a simple
 * singleton store: set before starting, consume after stopping.
 *
 * Flow:
 * 1. User chooses "Record" or "Join & record" on a meeting reminder
 * 2. The calendar runtime calls setPendingCalendarEvent(event)
 * 3. Recording starts (its own ID is assigned internally)
 * 4. Recording stops → history item created
 * 5. History context calls consumePendingCalendarMeta() to attach metadata
 */

import type { CalendarEvent } from './types';

/** Calendar event metadata ready to attach to a history item. */
export interface CalendarRecordingMeta {
  calendarEventId: string;
  scheduledTitle: string;
  participants: Array<{ name?: string; email?: string; status?: string }>;
  scheduledStart: string;
  scheduledEnd: string;
  meetingUrl?: string;
}

let pendingEvent: CalendarRecordingMeta | null = null;

/** Store calendar metadata for the next recording about to start. */
export function setPendingCalendarEvent(event: CalendarEvent): void {
  pendingEvent = {
    calendarEventId: event.event_id,
    scheduledTitle: event.title,
    participants: event.attendees
      .filter(a => a.status !== 'declined')
      .map(a => ({
        name: a.name ?? undefined,
        email: a.email ?? undefined,
        status: a.status,
      })),
    scheduledStart: event.start_date,
    scheduledEnd: event.end_date,
    meetingUrl: event.meeting_url ?? undefined,
  };
}

/**
 * Retrieve and consume the pending calendar metadata.
 * Returns null if no calendar event is pending.
 * Automatically clears the pending state after consumption.
 */
export function consumePendingCalendarMeta(): CalendarRecordingMeta | null {
  const meta = pendingEvent;
  pendingEvent = null;
  return meta;
}

/** Check if there's a pending calendar event (non-destructive). */
export function hasPendingCalendarEvent(): boolean {
  return pendingEvent !== null;
}
