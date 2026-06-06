/**
 * useCalendarEvents Hook
 *
 * Subscribes to the calendarService event cache and transforms events
 * into Schedule-X compatible format using the Temporal API.
 *
 * Exposes:
 * - events: raw EnrichedCalendarEvent[] from the cache
 * - scheduleXEvents: transformed events for Schedule-X consumption
 * - isEmpty: whether there are no events
 * - refresh: trigger an immediate cache refresh (for Sync button)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Temporal } from 'temporal-polyfill';
import { calendarService } from '@services/calendar';
import type { EnrichedCalendarEvent } from '@services/calendar';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

/**
 * Sanitize an EventKit event ID for use as a Schedule-X event ID.
 * Schedule-X uses IDs in CSS selectors (document.querySelector), so characters
 * like `:`, `@`, `.` that are invalid in CSS idents must be stripped.
 * We replace non-alphanumeric/hyphen/underscore chars with hyphens.
 */
function sanitizeEventId(eventId: string): string {
  return eventId.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** Convert an ISO 8601 date string to a Temporal.ZonedDateTime in the local timezone. */
function toZonedDateTime(isoDate: string): Temporal.ZonedDateTime {
  const timezone = Temporal.Now.timeZoneId();
  const instant = Temporal.Instant.from(isoDate);
  return instant.toZonedDateTimeISO(timezone);
}

/** Map an enriched calendar event to Schedule-X's CalendarEvent format. */
function toScheduleXEvent(event: EnrichedCalendarEvent): ScheduleXCalendarEvent {
  return {
    id: sanitizeEventId(event.event_id),
    title: event.title,
    start: toZonedDateTime(event.start_date),
    end: toZonedDateTime(event.end_date),
    calendarId: event.calendar_name,
    location: event.location,
    description: event.notes,
    people: event.attendees
      .filter((a) => a.status !== 'declined')
      .map((a) => a.name ?? a.email ?? 'Unknown'),
  };
}

export function useCalendarEvents() {
  const [events, setEvents] = useState<EnrichedCalendarEvent[]>(
    () => calendarService.getCachedEvents()
  );

  useEffect(() => {
    const unsubscribe = calendarService.onEventsUpdated(setEvents);
    return unsubscribe;
  }, []);

  const scheduleXEvents: ScheduleXCalendarEvent[] = useMemo(() => {
    return events
      .filter((e) => !e.is_all_day)
      .map(toScheduleXEvent);
  }, [events]);

  const refresh = useCallback(async () => {
    await calendarService.forceRefresh();
  }, []);

  return {
    events,
    scheduleXEvents,
    isEmpty: events.length === 0,
    refresh,
  };
}
