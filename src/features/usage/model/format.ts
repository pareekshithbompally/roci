/** How usage figures read: a measure's value, and a bucket's date. */

import type { UsageMeasure } from '@config/usage.config';
import { formatShortDate, formatWeekdayDate, formatMonthShort, formatMonth } from '@shared/utils/formatters';
import { formatCost, formatTokenCount } from '@extensions/usage/format';
import type { UsageBucketSize } from '@extensions/usage';
import { keyToDate } from './period';

const COUNT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** A value in its measure's unit: "$0.30", "127". */
export const formatMeasure = (measure: UsageMeasure, value: number): string => (measure === 'cost' ? formatCost(value) : COUNT.format(value));

/** A token count, compact: "253.9k". */
export const formatTokens = (tokens: number): string => formatTokenCount(Math.round(tokens));

/** A bucket's date: short for axis labels ("18 Oct", "Oct"), long for table rows ("Mon 10 Nov", "October 2026"). */
export function bucketLabel(key: string, bucket: UsageBucketSize, style: 'short' | 'long'): string {
  const date = keyToDate(key);
  if (bucket === 'day') return style === 'short' ? formatShortDate(date) : formatWeekdayDate(date);
  return style === 'short' ? formatMonthShort(date) : formatMonth(date);
}
