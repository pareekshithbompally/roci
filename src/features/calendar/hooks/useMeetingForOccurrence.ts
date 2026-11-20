/** The Roci meeting recorded from a calendar occurrence: the store's meetings for that event, matched to the occurrence. */

import { useMeetingsFound } from '@shared/hooks/useMeetings';
import { findMeetingForOccurrence } from '@services/calendar';
import type { CalendarEvent } from '@services/calendar';
import type { HistoryItem } from '@shared/types';
import { CALENDAR_CONFIG } from '@config/calendar.config';

/** The event's meetings made within a day of this occurrence's start: the few that can be its recording. */
function occurrenceFilter(event: CalendarEvent | null) {
  if (!event) return {};
  const start = new Date(event.start_date).getTime();
  const { occurrenceWindowMs } = CALENDAR_CONFIG;
  return { calendarEvent: event.event_id, since: start - occurrenceWindowMs, until: start + occurrenceWindowMs };
}

export function useMeetingForOccurrence(event: CalendarEvent | null): HistoryItem | null {
  const meetings = useMeetingsFound(occurrenceFilter(event), CALENDAR_CONFIG.meetingsPerOccurrence, !!event);
  return event ? findMeetingForOccurrence(meetings, event) : null;
}
