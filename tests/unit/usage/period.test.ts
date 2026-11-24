import { describe, expect, it } from 'vitest';
import { bucketKeys, elapsedBuckets, keyToDate, monthKey, previousWindow, windowFor } from '@features/usage/model/period';
import { addDays, localDayKey as dayKey } from '@shared/utils/localDate';

const now = new Date(2026, 10, 17, 15, 30); // Tue 17 Nov 2026, 15:30 local
const MONDAY = 2; // 1 = Sunday … 7 = Saturday

describe('usage periods', () => {
  it('keys local days and months the way SQLite localtime does', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(monthKey(new Date(2026, 8, 30))).toBe('2026-09');
    expect(dayKey(keyToDate('2026-03-08'))).toBe('2026-03-08');
    expect(keyToDate('2026-03').getDate()).toBe(1);
  });

  it('steps calendar days across DST without skipping or repeating', () => {
    const keys = new Set<string>();
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = addDays(d, 1)) keys.add(dayKey(d));
    expect(keys.size).toBe(365);
  });

  it('a week is the calendar week from the device\'s first weekday, whole, end exclusive', () => {
    const w = windowFor('week', 0, now, MONDAY);
    expect(w.bucket).toBe('day');
    expect(w.since).toBe(new Date(2026, 10, 16).getTime());
    expect(w.until).toBe(new Date(2026, 10, 23).getTime());
    expect(bucketKeys(w, null, now)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(elapsedBuckets(w, null, now)).toBe(2);
    expect(windowFor('week', 0, now, 1).since).toBe(new Date(2026, 10, 15).getTime());
  });

  it('steps back whole weeks and months; the previous window ends where this one starts', () => {
    expect(windowFor('week', 2, now, MONDAY).since).toBe(new Date(2026, 10, 2).getTime());
    const month = windowFor('month', 0, now, MONDAY);
    expect(bucketKeys(month, null, now)).toHaveLength(30);
    const prev = previousWindow('month', 0, now, MONDAY)!;
    expect(prev.until).toBe(month.since);
    expect(bucketKeys(prev, null, now)).toHaveLength(31);
    expect(elapsedBuckets(prev, null, now)).toBe(31);
    expect(previousWindow('all', 0, now, MONDAY)).toBeNull();
  });

  it('all time runs in months from the first record to now', () => {
    const w = windowFor('all', 0, now, MONDAY);
    expect(w.since).toBeUndefined();
    expect(w.bucket).toBe('month');
    expect(bucketKeys(w, new Date(2026, 7, 20).getTime(), now)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(bucketKeys(w, null, now)).toEqual(['2026-11']);
  });
});
