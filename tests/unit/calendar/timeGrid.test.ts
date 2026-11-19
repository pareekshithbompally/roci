/** Time-grid layout: the visible days, each event's place in minutes from local midnight, and overlap lanes. */

process.env.TZ = 'Europe/Berlin';

import { describe, it, expect } from 'vitest';
import { visibleRange, layoutDay, isOnDay, weekNumber } from '@features/calendar/utils/timeGrid';
import type { CalendarEvent } from '@services/calendar';

/** An event from local wall-clock times (Berlin), e.g. ev('A', '2026-11-19T10:00', '2026-11-19T10:30'). */
function ev(id: string, start: string, end: string): CalendarEvent {
  const s = new Date(start);
  const e = new Date(end);
  return {
    event_id: id, title: id, start_date: s.toISOString(), end_date: e.toISOString(), attendees: [],
    calendar_name: 'Work', is_all_day: false, start_ms: s.getTime(), end_ms: e.getTime(),
    is_cancelled: false, is_free: false, meeting_url: null, meeting_provider: null,
  };
}

const day = (iso: string) => new Date(`${iso}T00:00`);
const place = (blocks: ReturnType<typeof layoutDay>) =>
  Object.fromEntries(blocks.map((b) => [b.event.event_id, { top: b.top, height: b.height, lane: b.lane, lanes: b.lanes }]));

describe('visibleRange', () => {
  it('week range starts Monday and spans 7 local days', () => {
    const { days, start, end } = visibleRange(new Date('2026-11-19T15:00'), 'week', 2);
    expect(days).toHaveLength(7);
    expect(start).toEqual(day('2026-11-16'));
    expect(days[6]).toEqual(day('2026-11-22'));
    expect(end).toEqual(day('2026-11-23'));
  });

  it('a Sunday-first week starts on Sunday', () => {
    expect(visibleRange(new Date('2026-11-19T15:00'), 'week', 1).start).toEqual(day('2026-11-15'));
  });

  it('a Sunday anchor in a Monday-first week belongs to the week before', () => {
    expect(visibleRange(new Date('2026-11-22T10:00'), 'week', 2).start).toEqual(day('2026-11-16'));
  });

  it('day range spans one day', () => {
    const { days, start, end } = visibleRange(new Date('2026-11-19T15:00'), 'day', 2);
    expect(days).toEqual([day('2026-11-19')]);
    expect(start).toEqual(day('2026-11-19'));
    expect(end).toEqual(day('2026-11-20'));
  });
});

describe('layoutDay', () => {
  it('places a 10:00–10:30 event at 600 / 30', () => {
    expect(place(layoutDay([ev('A', '2026-11-19T10:00', '2026-11-19T10:30')], day('2026-11-19'))).A)
      .toEqual({ top: 600, height: 30, lane: 0, lanes: 1 });
  });

  it('short events get the minimum height', () => {
    expect(place(layoutDay([ev('A', '2026-11-19T10:00', '2026-11-19T10:05')], day('2026-11-19'))).A.height).toBe(15);
  });

  it('non-overlapping events share lane 0 with lanes 1', () => {
    const p = place(layoutDay([ev('A', '2026-11-19T09:00', '2026-11-19T09:30'), ev('B', '2026-11-19T11:00', '2026-11-19T12:00')], day('2026-11-19')));
    expect([p.A.lane, p.A.lanes, p.B.lane, p.B.lanes]).toEqual([0, 1, 0, 1]);
  });

  it('overlapping chain shares lanes', () => {
    const p = place(layoutDay([
      ev('A', '2026-11-19T09:00', '2026-11-19T10:00'),
      ev('B', '2026-11-19T09:30', '2026-11-19T10:30'),
      ev('C', '2026-11-19T10:00', '2026-11-19T11:00'),
    ], day('2026-11-19')));
    expect([p.A.lane, p.B.lane, p.C.lane]).toEqual([0, 1, 0]);
    expect([p.A.lanes, p.B.lanes, p.C.lanes]).toEqual([2, 2, 2]);
  });

  it('back-to-back events do not overlap', () => {
    const p = place(layoutDay([ev('A', '2026-11-19T09:00', '2026-11-19T10:00'), ev('B', '2026-11-19T10:00', '2026-11-19T11:00')], day('2026-11-19')));
    expect([p.A.lanes, p.B.lanes]).toEqual([1, 1]);
  });

  it('splits an event across midnight', () => {
    const late = ev('A', '2026-11-19T23:00', '2026-11-20T01:00');
    expect(place(layoutDay([late], day('2026-11-19'))).A).toMatchObject({ top: 1380, height: 60 });
    expect(place(layoutDay([late], day('2026-11-20'))).A).toMatchObject({ top: 0, height: 60 });
  });

  it('an event ending at midnight stays on its day', () => {
    const late = ev('A', '2026-11-19T23:00', '2026-11-20T00:00');
    expect(layoutDay([late], day('2026-11-19'))).toHaveLength(1);
    expect(layoutDay([late], day('2026-11-20'))).toHaveLength(0);
  });

  it('places events by wall-clock time on a DST-change day', () => {
    expect(place(layoutDay([ev('A', '2026-03-29T10:00', '2026-03-29T11:00')], day('2026-03-29'))).A)
      .toMatchObject({ top: 600, height: 60 });
  });
});

describe('isOnDay', () => {
  it('an all-day event covers each day it spans, not the day its end falls on', () => {
    const holiday = ev('H', '2026-11-24T00:00', '2026-11-26T00:00');
    expect([isOnDay(holiday, day('2026-11-23')), isOnDay(holiday, day('2026-11-24')), isOnDay(holiday, day('2026-11-25')), isOnDay(holiday, day('2026-11-26'))])
      .toEqual([false, true, true, false]);
  });
});

describe('weekNumber', () => {
  it('ISO rules (Monday first, 4 days in week 1), as Calendar labels it (W47)', () => {
    expect(weekNumber(day('2026-11-19'), 2, 4)).toBe(47);
    expect(weekNumber(day('2027-01-01'), 2, 4)).toBe(53);
    expect(weekNumber(day('2026-01-01'), 2, 4)).toBe(1);
  });

  it('US rules (Sunday first, the week holding 1 January is week 1)', () => {
    expect(weekNumber(day('2026-11-15'), 1, 1)).toBe(47);
    expect(weekNumber(day('2026-01-01'), 1, 1)).toBe(1);
    expect(weekNumber(day('2026-12-31'), 1, 1)).toBe(1);
  });
});
