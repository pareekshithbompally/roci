/** How usage figures read: metric values, changes, bucket and span dates, axis ticks, one-line row details. */

import type { UsageMetric } from '@config/usage.config';
import { META_SEPARATOR } from '@config/ui.config';
import { formatCost, formatTokenCount } from '@extensions/usage/format';
import type { UsageBucketSize } from '@extensions/usage';
import { keyToDate } from './period';
import type { UsageChange, UsageTotals } from './series';

const COUNT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const AVERAGE_COUNT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });

const DAY_SHORT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const DAY_LONG = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short' });
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** A total in its metric's unit: "$0.30", "127", "253.9k". */
export function formatMetric(metric: UsageMetric, value: number): string {
  if (metric === 'cost') return formatCost(value);
  if (metric === 'requests') return COUNT.format(value);
  return formatTokenCount(Math.round(value));
}

/** An average, which may be fractional: sub-cent costs keep their digits, request averages one decimal. */
export function formatAverage(metric: UsageMetric, value: number): string {
  if (metric === 'cost') return formatCost(value, true);
  if (metric === 'requests') return AVERAGE_COUNT.format(value);
  return formatTokenCount(Math.round(value));
}

/** "+24%", "−12%", "0%", or "New" when nothing came before. */
export function formatChange(change: Exclude<UsageChange, null>): string {
  return change.kind === 'new' ? 'New' : PERCENT.format(change.ratio);
}

/** A bucket's date: short for axis labels ("18 Oct", "Oct"), long for rows and the headline ("Mon 10 Nov", "October 2026"). */
export function bucketLabel(key: string, bucket: UsageBucketSize, style: 'short' | 'long'): string {
  const date = keyToDate(key);
  if (bucket === 'day') return (style === 'short' ? DAY_SHORT : DAY_LONG).format(date);
  return (style === 'short' ? MONTH_SHORT : MONTH_LONG).format(date);
}

/** The span a series covers: "18 Oct – 17 Nov", or one label when it is a single bucket. */
export function spanLabel(keys: string[], bucket: UsageBucketSize): string {
  if (keys.length === 0) return '';
  const first = bucketLabel(keys[0], bucket, 'short');
  const last = bucketLabel(keys[keys.length - 1], bucket, 'short');
  return first === last ? first : `${first} – ${last}`;
}

/** The fewest decimals (up to 4) that write a tick step exactly: 0.02 → 2, 0.025 → 3, 5 → 0. */
function stepDecimals(step: number): number {
  for (let d = 0; d < 4; d++) {
    const scaled = step * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d;
  }
  return 4;
}

/** An axis tick: costs to the step's decimals ("$0.025"), counts and tokens compact. */
export function formatTick(metric: UsageMetric, value: number, step: number): string {
  if (value === 0) return '0';
  if (metric !== 'cost') return metric === 'requests' ? COUNT.format(value) : formatTokenCount(value);
  return `$${value.toFixed(stepDecimals(step))}`;
}

/** "72 requests · 239.3k in · 42.0k out"; token counts only when recorded, `prefix` first (a provider name). */
export function usageLine({ calls, input_tokens, output_tokens }: UsageTotals, prefix?: string): string {
  const parts = [prefix, `${COUNT.format(calls)} ${calls === 1 ? 'request' : 'requests'}`];
  if (input_tokens > 0) parts.push(`${formatTokenCount(input_tokens)} in`);
  if (output_tokens > 0) parts.push(`${formatTokenCount(output_tokens)} out`);
  return parts.filter(Boolean).join(META_SEPARATOR);
}
