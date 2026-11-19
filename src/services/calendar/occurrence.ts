/** One occurrence of a calendar event (recurring events share an id) and the Roci meeting recorded from it. */

import type { HistoryItem } from '@shared/types';
import type { CalendarEvent } from './types';

/** `id@start_ms`: the same key Rust's meeting reminders use, so a recurring event's occurrences stay apart. */
export function occurrenceKey(eventId: string, startIso: string): string {
  return `${eventId}@${Date.parse(startIso)}`;
}

/** The meeting recorded from this occurrence (the newest, if it was recorded twice); null when none was. */
export function findMeetingForOccurrence(
  meetings: HistoryItem[],
  event: Pick<CalendarEvent, 'event_id' | 'start_date'>,
): HistoryItem | null {
  const key = occurrenceKey(event.event_id, event.start_date);
  let found: HistoryItem | null = null;
  for (const meeting of meetings) {
    if (!meeting.calendarEventId || !meeting.scheduledStart) continue;
    if (occurrenceKey(meeting.calendarEventId, meeting.scheduledStart) !== key) continue;
    if (!found || meeting.timestamp > found.timestamp) found = meeting;
  }
  return found;
}
