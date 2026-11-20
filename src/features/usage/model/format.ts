/** How usage figures read: a measure's value, and a bucket's date. */

import type { UsageMeasure } from '@config/usage.config';
import { formatShortDate, formatWeekdayDate, formatMonthShort, formatMonth } from '@shared/utils/formatters';
import { formatTokenCount } from '@extensions/usage/format';
import type { UsageBucketSize } from '@extensions/usage';
import { keyToDate } from './period';

const COUNT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const USD_SMALL = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 });
const USD_TICK = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 3 });

/** Dollars exactly, never words: "$0.00", "$0.0042", "$1.25". */
const formatUsd = (usd: number): string => (usd > 0 && usd < 0.01 ? USD_SMALL.format(usd) : USD.format(usd));

/** A value in its measure's unit: "$0.30", "127". */
export const formatMeasure = (measure: UsageMeasure, value: number): string => (measure === 'cost' ? formatUsd(value) : COUNT.format(value));

/** An axis tick, short: "$0", "$0.025", "$1", "120". */
export const formatTick = (measure: UsageMeasure, value: number): string => (measure === 'cost' ? USD_TICK.format(value) : COUNT.format(value));

const MILLISECONDS = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'millisecond', maximumFractionDigits: 0 });
const SECONDS = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'second', maximumFractionDigits: 1 });

/** A duration, in the unit that reads: "171 ms", "1.5 sec". */
export const formatMs = (ms: number): string => (ms < 1000 ? MILLISECONDS.format(ms) : SECONDS.format(ms / 1000));

/** A token count, compact: "253.9k". */
export const formatTokens = (tokens: number): string => formatTokenCount(Math.round(tokens));

/** A bucket's date: short for axis labels ("18 Oct", "Oct"), long for table rows ("Mon 10 Nov", "October 2026"). */
export function bucketLabel(key: string, bucket: UsageBucketSize, style: 'short' | 'long'): string {
  const date = keyToDate(key);
  if (bucket === 'day') return style === 'short' ? formatShortDate(date) : formatWeekdayDate(date);
  return style === 'short' ? formatMonthShort(date) : formatMonth(date);
}
