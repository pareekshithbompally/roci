/** The calendar's events in the range on screen (timed and all-day); every cached range rereads on `calendar://changed` (useCalendarRuntime). */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { calendarService } from '@services/calendar';
import { queryKeys } from '@shared/query/queryKeys';
import type { CalendarEvent } from '@services/calendar';

interface RangeEvents {
  /** Timed events, for the grid. */
  events: CalendarEvent[];
  /** All-day events, for the strip above it. */
  allDay: CalendarEvent[];
}

const NONE: RangeEvents = { events: [], allDay: [] };

/** Cancelled events are dropped; all-day ones go to their own strip. */
function split(events: CalendarEvent[]): RangeEvents {
  const kept = events.filter((e) => !e.is_cancelled);
  return { events: kept.filter((e) => !e.is_all_day), allDay: kept.filter((e) => e.is_all_day) };
}

/** The read failed (`isError`); `retry` reads again. */
export function useRangeEvents(range: { start: Date; end: Date }, enabled: boolean): RangeEvents & { isError: boolean; retry: () => void } {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.calendarEvents(start, end),
    queryFn: () => calendarService.getEventsInRange(start, end),
    select: split,
    enabled,
    // The week before stays on screen until the next one is read: no blank flash between weeks.
    placeholderData: keepPreviousData,
  });
  return { ...(data ?? NONE), isError, retry: () => void refetch() };
}
