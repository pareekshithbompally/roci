/** The calendar's timed events in the range on screen; every cached range rereads on `calendar://changed` (useCalendarRuntime). */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { calendarService } from '@services/calendar';
import { queryKeys } from '@shared/query/queryKeys';
import type { CalendarEvent } from '@services/calendar';

const NO_EVENTS: CalendarEvent[] = [];

/** All-day and cancelled events have no place on the time grid. */
const timed = (events: CalendarEvent[]) => events.filter((e) => !e.is_all_day && !e.is_cancelled);

export function useRangeEvents(range: { start: Date; end: Date }, enabled: boolean): { events: CalendarEvent[]; isPending: boolean } {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.calendarEvents(start, end),
    queryFn: () => calendarService.getEventsInRange(start, end),
    select: timed,
    enabled,
    // The week before stays on screen until the next one is read: no blank flash between weeks.
    placeholderData: keepPreviousData,
  });
  return { events: data ?? NO_EVENTS, isPending };
}
