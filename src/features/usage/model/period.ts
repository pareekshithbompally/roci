/** Time windows for usage, in local calendar days (DST-safe: days step by date, never by 24 h): a calendar week or month,
 *  stepped back from the one holding today, or all time in months. */

import { addDays, localDayKey, startOfDay, startOfMonth, startOfWeek, DAYS_PER_WEEK } from '@shared/utils/localDate';
import type { UsagePeriod } from '@config/usage.config';
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

/** The window of `period`, `offset` steps back (0 holds today): a whole calendar week or month by day; all time by month,
 *  ending with today. */
export function windowFor(period: UsagePeriod, offset: number, now: Date, firstWeekday: number): UsageWindow {
  if (period === 'all') return { until: addDays(startOfDay(now), 1).getTime(), bucket: 'month' };
  const start = period === 'week' ? addDays(startOfWeek(now, firstWeekday), -offset * DAYS_PER_WEEK) : startOfMonth(now, -offset);
  const end = period === 'week' ? addDays(start, DAYS_PER_WEEK) : startOfMonth(start, 1);
  return { since: start.getTime(), until: end.getTime(), bucket: 'day' };
}

/** The period just before, for the change against it; none for all time. */
export function previousWindow(period: UsagePeriod, offset: number, now: Date, firstWeekday: number): UsageWindow | null {
  return period === 'all' ? null : windowFor(period, offset + 1, now, firstWeekday);
}

/** Every bucket key in the window, oldest first: each day of a week or month (days still to come included, as Screen Time
 *  shows the whole week), each month from the first record to now. */
export function bucketKeys(window: UsageWindow, firstTimestamp: number | null, now: Date): string[] {
  const keys: string[] = [];
  if (window.bucket === 'day') {
    for (let d = new Date(window.since ?? startOfDay(now).getTime()); d.getTime() < window.until; d = addDays(d, 1)) keys.push(localDayKey(d));
    return keys;
  }
  const first = startOfMonth(firstTimestamp === null ? now : new Date(firstTimestamp));
  for (let m = first; m <= now; m = startOfMonth(m, 1)) keys.push(monthKey(m));
  return keys;
}

/** How many of the window's buckets have begun by now (at least one), the divisor of a daily or monthly average. */
export function elapsedBuckets(window: UsageWindow, firstTimestamp: number | null, now: Date): number {
  const today = window.bucket === 'day' ? localDayKey(now) : monthKey(now);
  return Math.max(1, bucketKeys(window, firstTimestamp, now).filter((key) => key <= today).length);
}
