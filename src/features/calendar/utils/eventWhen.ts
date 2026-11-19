/** When an event happens, as Calendar's popover says it: all-day, one day with its times, or from one date-time to another. */

import { CALENDAR_CONFIG } from '@config/calendar.config';
import { formatClockTime, formatDate, formatDateTime } from '@shared/utils/formatters';
import { addDays } from '@shared/utils/localDate';
import type { CalendarEvent } from '@services/calendar';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function formatEventWhen(event: CalendarEvent): string {
  const start = new Date(event.start_date);
  const end = new Date(event.end_date);
  if (event.is_all_day) {
    // An all-day event ends at the midnight after its last day.
    const last = addDays(end, -1);
    return sameDay(start, last) ? `${formatDate(start)}  ${CALENDAR_CONFIG.allDayLabel}` : `${formatDate(start)} – ${formatDate(last)}`;
  }
  if (sameDay(start, end)) return `${formatDate(start)}  ${formatClockTime(start)} – ${formatClockTime(end)}`;
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}
