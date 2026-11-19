/** Time-grid layout: the days on screen, and where each event sits in its day (minutes from local midnight, overlap lanes). */

import { CALENDAR_CONFIG } from '@config/calendar.config';
import type { CalendarEvent } from '@services/calendar';

/** `week` (Mac) or `day` (iPhone): the grid's span and the step of back / forward. */
export type CalendarSpan = 'week' | 'day';

export interface GridBlock {
  event: CalendarEvent;
  /** Minutes from the day's local midnight. */
  top: number;
  height: number;
  lane: number;
  /** Lanes in this block's overlap group. */
  lanes: number;
}

const MINUTES_PER_DAY = 24 * 60;
const DAYS_PER_WEEK = 7;

/** Local midnight `n` days after `date`'s (wall-clock, so daylight-saving days stay whole). */
function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** Wall-clock minutes since local midnight. */
export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** The local days on screen around `anchor` (a week from Monday, or the one day) and the range to read. */
export function visibleRange(anchor: Date, span: CalendarSpan): { days: Date[]; start: Date; end: Date } {
  const mondayOffset = (anchor.getDay() + 6) % DAYS_PER_WEEK;
  const start = span === 'week' ? addDays(anchor, -mondayOffset) : addDays(anchor, 0);
  const count = span === 'week' ? DAYS_PER_WEEK : 1;
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  return { days, start, end: addDays(start, count) };
}

interface Span {
  event: CalendarEvent;
  start: number;
  end: number;
}

/** The part of `event` inside `day`, in minutes; null when it isn't on that day. */
function clip(event: CalendarEvent, day: Date, nextDay: Date): Span | null {
  const start = new Date(event.start_date);
  const end = new Date(event.end_date);
  if (start >= nextDay || end <= day) return null;
  return {
    event,
    start: start <= day ? 0 : minutesIntoDay(start),
    end: end >= nextDay ? MINUTES_PER_DAY : minutesIntoDay(end),
  };
}

/** Lanes for one group of transitively overlapping spans: each takes the first lane free at its start. */
function laneGroup(group: Span[]): GridBlock[] {
  const laneEnds: number[] = [];
  const placed = group.map((span) => {
    let lane = laneEnds.findIndex((end) => end <= span.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = span.end;
    return { span, lane };
  });
  return placed.map(({ span, lane }) => ({
    event: span.event,
    top: span.start,
    height: Math.max(span.end - span.start, CALENDAR_CONFIG.grid.minBlockMinutes),
    lane,
    lanes: laneEnds.length,
  }));
}

/** Where each of `events` sits on `day`; events crossing midnight appear on both days. */
export function layoutDay(events: CalendarEvent[], day: Date): GridBlock[] {
  const nextDay = addDays(day, 1);
  const spans = events
    .map((event) => clip(event, day, nextDay))
    .filter((span): span is Span => span !== null)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const blocks: GridBlock[] = [];
  let group: Span[] = [];
  let groupEnd = -1;
  for (const span of spans) {
    if (group.length > 0 && span.start >= groupEnd) {
      blocks.push(...laneGroup(group));
      group = [];
    }
    groupEnd = group.length === 0 ? span.end : Math.max(groupEnd, span.end);
    group.push(span);
  }
  if (group.length > 0) blocks.push(...laneGroup(group));
  return blocks;
}
