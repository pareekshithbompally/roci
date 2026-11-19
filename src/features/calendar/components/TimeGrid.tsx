/** Read-only time grid as Calendar.app draws it: week number and day headers, an all-day strip, hour labels and lines,
 *  event blocks in their calendars' colours, and the red now pill with its line; opens scrolled to now. */

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Surface, Text } from '@shared/ui';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { useMinuteClock } from '@shared/hooks/useMinuteClock';
import { MINUTES_PER_HOUR, isSameDay } from '@shared/utils/localDate';
import { formatClockTime, formatHour, formatWeekday } from '@shared/utils/formatters';
import { isOnDay, layoutDay, minutesIntoDay, minutesToPx as toPx, weekNumber } from '@features/calendar/utils/timeGrid';
import { occurrenceKey } from '@services/calendar';
import { useSystemFormatStore } from '@shared/stores/systemFormatStore';
import { EventBlock } from './EventBlock';
import type { CalendarEvent } from '@services/calendar';

const { hourHeight, scrollLeadHours, nowLabelClearancePx } = CALENDAR_CONFIG.grid;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type OnEventClick = (event: CalendarEvent, rect: DOMRect) => void;

interface TimeGridProps {
  days: Date[];
  events: CalendarEvent[];
  allDay: CalendarEvent[];
  onEventClick: OnEventClick;
}

/** The left column every row shares: week number, "all-day", then the hours. */
const Gutter: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="relative w-16 shrink-0 flex items-start justify-end pr-2">{children}</div>
);

/** "Thu 19", today's date in the red circle. */
const DayHeader: React.FC<{ day: Date; today: boolean }> = ({ day, today }) => (
  <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5">
    <Text variant="body" tone="primary">{formatWeekday(day)}</Text>
    {today ? (
      <Surface variant="nowMark" radius="full" className="px-1.5">
        <Text variant="headline" tone="onAccent">{day.getDate()}</Text>
      </Surface>
    ) : (
      <Text variant="body" tone="primary">{day.getDate()}</Text>
    )}
  </div>
);

const AllDayPill: React.FC<{ event: CalendarEvent; onClick: OnEventClick }> = ({ event, onClick }) => (
  <Surface
    variant="event"
    tint={event.calendar_color}
    radius="full"
    interactive
    role="button"
    aria-label={event.title}
    className="px-2 py-0.5"
    onClick={(e) => onClick(event, e.currentTarget.getBoundingClientRect())}
  >
    <Text as="div" variant="headline" tone="event" truncate>{event.title}</Text>
  </Surface>
);

/** All-day events as pills under each day they cover; shown only when the range has any. */
const AllDayStrip: React.FC<{ days: Date[]; events: CalendarEvent[]; onEventClick: OnEventClick }> = ({ days, events, onEventClick }) => (
  <Surface edge="bottom" className="shrink-0 flex">
    <Gutter><Text variant="caption" tone="muted" className="py-1">{CALENDAR_CONFIG.allDayLabel}</Text></Gutter>
    {days.map((day) => (
      <Surface key={day.toDateString()} edge="left" className="flex-1 min-w-0 space-y-0.5 p-0.5">
        {events.filter((event) => isOnDay(event, day)).map((event) => <AllDayPill key={event.event_id} event={event} onClick={onEventClick} />)}
      </Surface>
    ))}
  </Surface>
);

/** Hour labels, each centred on its line; one the now pill would touch gives way to it. */
const HourLabels: React.FC<{ now: Date | null }> = ({ now }) => {
  const nowPx = now ? toPx(minutesIntoDay(now)) : null;
  const covered = (h: number) => nowPx !== null && Math.abs(nowPx - toPx(h * MINUTES_PER_HOUR)) < nowLabelClearancePx;
  return (
    <>
      {HOURS.filter((h) => h > 0 && !covered(h)).map((h) => (
        <Text key={h} as="div" variant="caption" tone="muted" className="absolute right-2 -translate-y-1/2 whitespace-nowrap" style={{ top: toPx(h * MINUTES_PER_HOUR) }}>
          {formatHour(h)}
        </Text>
      ))}
    </>
  );
};

/** The red time pill at the gutter's edge. */
const NowPill: React.FC<{ now: Date }> = ({ now }) => (
  <Surface variant="nowMark" radius="full" className="absolute right-1 -translate-y-1/2 px-1.5 whitespace-nowrap" style={{ top: toPx(minutesIntoDay(now)) }}>
    <Text variant="label" tone="onAccent">{formatClockTime(now)}</Text>
  </Surface>
);

/** The now line: dim across the week, solid across today, as Calendar.app draws it. */
const NowLine: React.FC<{ days: Date[]; now: Date }> = ({ days, now }) => {
  const share = 100 / days.length;
  const today = days.findIndex((d) => isSameDay(d, now));
  const top = toPx(minutesIntoDay(now));
  return (
    <>
      <Surface variant="nowTrail" className="absolute inset-x-0 h-px -translate-y-1/2 pointer-events-none" style={{ top }} />
      <Surface variant="nowMark" className="absolute h-0.5 -translate-y-1/2 pointer-events-none" style={{ top, left: `${today * share}%`, width: `${share}%` }} />
    </>
  );
};

const DayColumn: React.FC<{ day: Date; events: CalendarEvent[]; onEventClick: OnEventClick }> = ({ day, events, onEventClick }) => {
  const blocks = useMemo(() => layoutDay(events, day), [events, day]);
  return (
    <Surface edge="left" className="relative flex-1 min-w-0">
      {blocks.map((block) => <EventBlock key={occurrenceKey(block.event.event_id, block.event.start_date)} block={block} onClick={onEventClick} />)}
    </Surface>
  );
};

export const TimeGrid: React.FC<TimeGridProps> = ({ days, events, allDay, onEventClick }) => {
  const now = useMinuteClock();
  const scrollRef = useRef<HTMLDivElement>(null);
  const showsToday = days.some((d) => isSameDay(d, now));
  const firstWeekday = useSystemFormatStore((s) => s.firstWeekday);
  const minDays = useSystemFormatStore((s) => s.minDaysInFirstWeek);

  // Once, on open: the current hour (less a lead) at the top.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, new Date().getHours() - scrollLeadHours) * hourHeight;
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex">
        <Gutter><Text variant="caption" tone="muted" className="py-2">W{weekNumber(days[0], firstWeekday, minDays)}</Text></Gutter>
        {days.map((day) => <DayHeader key={day.toDateString()} day={day} today={isSameDay(day, now)} />)}
      </div>
      {allDay.length > 0 ? <AllDayStrip days={days} events={allDay} onEventClick={onEventClick} /> : <Surface edge="bottom" />}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div className="relative flex" style={{ height: HOURS.length * hourHeight }}>
          <Gutter>
            <HourLabels now={showsToday ? now : null} />
            {showsToday && <NowPill now={now} />}
          </Gutter>
          <div className="relative flex flex-1 min-w-0">
            {HOURS.map((h) => (
              <Surface key={h} edge="top" className="absolute inset-x-0 pointer-events-none" style={{ top: toPx(h * MINUTES_PER_HOUR) }} />
            ))}
            {days.map((day) => <DayColumn key={day.toDateString()} day={day} events={events} onEventClick={onEventClick} />)}
            {showsToday && <NowLine days={days} now={now} />}
          </div>
        </div>
      </div>
    </div>
  );
};
