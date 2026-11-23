/** Holds the calendar event for the next recording: set when a reminder starts it, consumed when it's saved. */

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

/** Takes and clears the pending calendar metadata; null when none is pending. */
export function consumePendingCalendarMeta(): CalendarRecordingMeta | null {
  const meta = pendingEvent;
  pendingEvent = null;
  return meta;
}
