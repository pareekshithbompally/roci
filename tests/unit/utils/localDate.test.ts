/** Local-calendar date helpers shared by the calendar, usage, reminders and AI tools. */

process.env.TZ = 'Europe/Berlin';

import { describe, it, expect } from 'vitest';
import { addDays, daysBetween, isSameDay, localDayKey, startOfDay } from '@shared/utils/localDate';

describe('localDate', () => {
  it('addDays steps whole local days across a DST change', () => {
    expect(addDays(new Date(2026, 2, 28, 15), 1)).toEqual(new Date(2026, 2, 29));
  });

  it('startOfDay is local midnight', () => {
    expect(startOfDay(new Date(2026, 10, 19, 21, 28))).toEqual(new Date(2026, 10, 19));
  });

  it('localDayKey is YYYY-MM-DD in local time', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('isSameDay compares local calendar days', () => {
    expect(isSameDay(new Date(2026, 10, 19, 0, 1), new Date(2026, 10, 19, 23, 59))).toBe(true);
    expect(isSameDay(new Date(2026, 10, 19, 23, 59), new Date(2026, 10, 20, 0, 1))).toBe(false);
  });

  it('daysBetween counts local days, a DST change counting as one', () => {
    expect(daysBetween(new Date(2026, 2, 28, 12), new Date(2026, 2, 30, 1))).toBe(2);
    expect(daysBetween(new Date(2026, 10, 20), new Date(2026, 10, 19))).toBe(-1);
  });
});
