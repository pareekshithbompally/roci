/** When an event happens, as its popover says it: all-day, one day with times, or from one date-time to another. */

process.env.TZ = 'Europe/Berlin';

import { describe, it, expect, beforeEach } from 'vitest';
import { formatEventWhen } from '@features/calendar/utils/eventWhen';
import { setSystemFormat } from '@shared/stores/systemFormatStore';
import type { CalendarEvent } from '@services/calendar';

const ev = (start: string, end: string, is_all_day = false): CalendarEvent => ({
  event_id: 'E', title: 'E', start_date: new Date(start).toISOString(), end_date: new Date(end).toISOString(), attendees: [],
  calendar_name: 'Work', is_all_day, start_ms: 0, end_ms: 0, is_cancelled: false, is_free: false, meeting_url: null, meeting_provider: null,
});

beforeEach(() => setSystemFormat({ locale: 'en-IN', hour24: true, firstWeekday: 2, minDaysInFirstWeek: 4 }));

describe('formatEventWhen', () => {
  it('a timed event on one day: date and times', () => {
    expect(formatEventWhen(ev('2026-11-19T22:00', '2026-11-19T23:00'))).toBe('19 Nov 2026  22:00 – 23:00');
  });

  it('a one-day all-day event: the date, all-day', () => {
    expect(formatEventWhen(ev('2026-11-24T00:00', '2026-11-25T00:00', true))).toBe('24 Nov 2026  all-day');
  });

  it('a multi-day all-day event: first to last day (its end is exclusive)', () => {
    expect(formatEventWhen(ev('2026-11-24T00:00', '2026-11-27T00:00', true))).toBe('24 Nov 2026 – 26 Nov 2026');
  });

  it('a timed event across days: from date-time to date-time', () => {
    expect(formatEventWhen(ev('2026-11-19T22:00', '2026-11-20T01:00'))).toBe('19 Nov 2026, 22:00 – 20 Nov 2026, 01:00');
  });
});
