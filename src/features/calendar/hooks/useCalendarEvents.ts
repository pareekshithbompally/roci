/** Calendar event cache, polling and first-fetch state, plus the events mapped to Schedule-X format. */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Temporal } from 'temporal-polyfill';
import { calendarService } from '@services/calendar';
import type { EnrichedCalendarEvent } from '@services/calendar';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

/** Schedule-X puts event IDs in CSS selectors, so strip characters invalid in CSS idents. */
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
    meetingUrl: event.meeting_url,
    meetingProvider: event.meeting_provider,
    people: event.attendees
      .filter((a) => a.status !== 'declined')
      .map((a) => a.name ?? a.email ?? 'Unknown'),
  };
}

interface CalendarEventsState {
  events: EnrichedCalendarEvent[];
  isEnabled: boolean;
  isInitialFetchDone: boolean;
  isEmpty: boolean;
  scheduleXEvents: ScheduleXCalendarEvent[];
  refresh: () => Promise<void>;
}

export function useCalendarEvents(): CalendarEventsState {
  const [events, setEvents] = useState<EnrichedCalendarEvent[]>(
    () => calendarService.getCachedEvents()
  );

  const [isEnabled, setIsEnabled] = useState(() => calendarService.isPollingActive());
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(() => calendarService.hasInitialFetchDone());

  useEffect(() => {
    const unsubscribe = calendarService.onEventsUpdated((updatedEvents) => {
      setEvents(updatedEvents);
      setIsEnabled(calendarService.isPollingActive());
      setIsInitialFetchDone(calendarService.hasInitialFetchDone());
    });
    return unsubscribe;
  }, []);

  const scheduleXEvents: ScheduleXCalendarEvent[] = useMemo(() => {
    return events
      .filter((e) => !e.is_all_day)
      .map(toScheduleXEvent);
  }, [events]);

  const isEmpty = scheduleXEvents.length === 0;

  const refresh = useCallback(async () => {
    await calendarService.forceRefresh();
  }, []);

  return {
    events,
    scheduleXEvents,
    isEmpty,
    isEnabled,
    isInitialFetchDone,
    refresh,
  };
}
