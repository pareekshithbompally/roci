import { describe, expect, it } from 'vitest';
import { bucketKeys, keyToDate, monthKey, previousWindow, windowFor } from '@features/usage/model/period';
import { addDays, localDayKey as dayKey, startOfDay } from '@shared/utils/localDate';

const now = new Date(2026, 10, 17, 15, 30); // 17 Nov 2026, 15:30 local

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

  it('a fixed range is N local days ending with today, end exclusive', () => {
    const w = windowFor('7d', now);
    expect(w.bucket).toBe('day');
    expect(w.since).toBe(new Date(2026, 10, 11).getTime());
    expect(w.until).toBe(new Date(2026, 10, 18).getTime());
    const keys = bucketKeys(w, null, now);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-11-11');
    expect(keys[6]).toBe('2026-11-17');
  });

  it('the previous window is the same length, ending where this one starts', () => {
    const w = windowFor('30d', now);
    const prev = previousWindow('30d', now)!;
    expect(prev.until).toBe(w.since);
    expect(bucketKeys(prev, null, addDays(startOfDay(now), -30))).toHaveLength(30);
    expect(previousWindow('all', now)).toBeNull();
  });

  it('all time runs in months from the first record to now', () => {
    const w = windowFor('all', now);
    expect(w.since).toBeUndefined();
    expect(w.bucket).toBe('month');
    expect(bucketKeys(w, new Date(2026, 7, 20).getTime(), now)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(bucketKeys(w, null, now)).toEqual(['2026-11']);
  });
});
