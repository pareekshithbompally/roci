/** Time windows for usage, in local calendar days (DST-safe: days step by date, never by 24 h). */

import { addDays, localDayKey, startOfDay } from '@shared/utils/localDate';
import { USAGE_CONFIG, type UsageRange } from '@config/usage.config';
import type { UsageBucketSize } from '@extensions/usage';

/** `[since, until)` in epoch ms; `since` absent means from the first record. */
export interface UsageWindow {
  since?: number;
  until: number;
  bucket: UsageBucketSize;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local month key, as SQLite's `strftime('%Y-%m', …, 'localtime')` writes it: `YYYY-MM`. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** A bucket key back to the local date it starts on. */
export function keyToDate(key: string): Date {
  const [y, m, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The window a range covers, ending at the end of today: fixed ranges in days, all time in months. */
export function windowFor(range: UsageRange, now: Date): UsageWindow {
  const until = addDays(startOfDay(now), 1).getTime();
  if (range === 'all') return { until, bucket: 'month' };
  const days = USAGE_CONFIG.rangeDays[range];
  return { since: addDays(startOfDay(now), -(days - 1)).getTime(), until, bucket: 'day' };
}

/** The same number of days just before a fixed range, for "compared with"; none for all time. */
export function previousWindow(range: UsageRange, now: Date): UsageWindow | null {
  if (range === 'all') return null;
  const days = USAGE_CONFIG.rangeDays[range];
  const since = addDays(startOfDay(now), -(2 * days - 1)).getTime();
  return { since, until: addDays(startOfDay(now), -(days - 1)).getTime(), bucket: 'day' };
}

/** Every bucket key in the window, oldest first: each day of a fixed range, each month from the first record to now. */
export function bucketKeys(window: UsageWindow, firstTimestamp: number | null, now: Date): string[] {
  const today = startOfDay(now);
  if (window.bucket === 'day') {
    const keys: string[] = [];
    for (let d = new Date(window.since ?? today.getTime()); d <= today; d = addDays(d, 1)) keys.push(localDayKey(d));
    return keys;
  }
  const first = firstTimestamp === null ? today : new Date(firstTimestamp);
  const keys: string[] = [];
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= today; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    keys.push(monthKey(m));
  }
  return keys;
}

/** Calendar days the window spans up to today: the range's days, or from the first record's day for all time. */
export function dayCount(range: UsageRange, firstTimestamp: number | null, now: Date): number {
  if (range !== 'all') return USAGE_CONFIG.rangeDays[range];
  if (firstTimestamp === null) return 1;
  let days = 1;
  for (let d = startOfDay(new Date(firstTimestamp)); d < startOfDay(now); d = addDays(d, 1)) days++;
  return days;
}
