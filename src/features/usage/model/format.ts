/** How usage figures read: a measure's value, and a bucket's date. */

import { USAGE_CONFIG, type UsageMeasure, type UsagePeriod } from '@config/usage.config';
import { formatShortDate, formatWeekday, formatWeekdayDate, formatMonthShort, formatMonth } from '@shared/utils/formatters';
import type { UsageBucketSize } from '@extensions/usage';
import { addDays, DAYS_PER_WEEK } from '@shared/utils/localDate';
import { keyToDate, type UsageWindow } from './period';

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

const TOKENS = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** A token count in the locale's compact form: "254K", "1.2M". */
export const formatTokens = (tokens: number): string => TOKENS.format(Math.round(tokens));

/** A bucket's date: short for axis labels ("18 Oct", "Oct"), long for table rows ("Mon 10 Nov", "October 2026"). */
export function bucketLabel(key: string, bucket: UsageBucketSize, style: 'short' | 'long'): string {
  const date = keyToDate(key);
  if (bucket === 'day') return style === 'short' ? formatShortDate(date) : formatWeekdayDate(date);
  return style === 'short' ? formatMonthShort(date) : formatMonth(date);
}

/** A bucket under its bar: the weekday across a week ("Mon"), the date across a month ("18 Nov"), the month across all time. */
export function axisLabel(key: string, period: UsagePeriod): string {
  const date = keyToDate(key);
  if (period === 'week') return formatWeekday(date);
  return period === 'month' ? formatShortDate(date) : formatMonthShort(date);
}

const COPY = USAGE_CONFIG.copy;

/** The stepper's name for a period: this one, the one before, then its dates ("2 – 8 Nov", "October 2026"). */
export function periodName(period: UsagePeriod, offset: number, window: UsageWindow): string {
  if (period === 'all') return COPY.allTime;
  if (offset === 0) return COPY.step.current[period];
  if (offset === 1) return COPY.step.last[period];
  const start = new Date(window.since ?? window.until);
  return period === 'month' ? formatMonth(start) : `${formatShortDate(start)} – ${formatShortDate(addDays(start, DAYS_PER_WEEK - 1))}`;
}

/** A cost as it reads: dollars, or "No price" when calls had none and nothing else priced it. */
export const costText = (cost: number, unpriced: number): string => (cost === 0 && unpriced > 0 ? COPY.prices.sources.unknown : formatMeasure('cost', cost));

/** A figure in the page's lead measure: its cost (or "No price"), or its requests. */
export const leadText = (measure: UsageMeasure, t: { calls: number; estimated_cost: number; unpriced?: number }): string =>
  (measure === 'cost' ? costText(t.estimated_cost, t.unpriced ?? 0) : formatMeasure('requests', t.calls));
