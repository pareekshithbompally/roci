/** Usage maths: every figure on screen derives from the recorded totals and buckets here, nowhere else. */

import type { UsageMetric } from '@config/usage.config';
import type { ProviderModelBreakdown, UsageBucket, UsageSummary } from '@extensions/usage';

/** The sums a row, a bucket or a whole window carries. */
export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

/** A window's own totals in row form. */
export const summaryTotals = (s: UsageSummary): UsageTotals => ({
  calls: s.total_calls,
  input_tokens: s.total_input_tokens,
  output_tokens: s.total_output_tokens,
  estimated_cost: s.total_cost,
});

/** The number a metric reads from totals: cost, request count, or input + output tokens. */
export function metricValue(metric: UsageMetric, t: UsageTotals): number {
  if (metric === 'cost') return t.estimated_cost;
  if (metric === 'requests') return t.calls;
  return t.input_tokens + t.output_tokens;
}

const EMPTY_BUCKET = { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, estimated_cost: 0 };

/** One bucket per key, oldest first; keys with no records read as zero, so the axis is continuous. */
export function fillSeries(keys: string[], trend: UsageBucket[]): UsageBucket[] {
  const byKey = new Map(trend.map((b) => [b.key, b]));
  return keys.map((key) => byKey.get(key) ?? { key, ...EMPTY_BUCKET });
}

/** Model rows summed per provider, most expensive (then busiest) first. */
export function totalsByProvider(rows: ProviderModelBreakdown[]): Array<UsageTotals & { provider: string }> {
  const byProvider = new Map<string, UsageTotals & { provider: string }>();
  for (const row of rows) {
    const t = byProvider.get(row.provider) ?? { provider: row.provider, calls: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0 };
    t.calls += row.calls;
    t.input_tokens += row.input_tokens;
    t.output_tokens += row.output_tokens;
    t.estimated_cost += row.estimated_cost;
    byProvider.set(row.provider, t);
  }
  return [...byProvider.values()].sort((a, b) => b.estimated_cost - a.estimated_cost || b.calls - a.calls);
}

/** Change against the previous window: a ratio (0.24 = +24 %), `new` when nothing came before, none when both are empty. */
export type UsageChange = { kind: 'ratio'; ratio: number; previous: number } | { kind: 'new' } | null;

export function changeFrom(current: number, previous: number): UsageChange {
  if (previous === 0) return current === 0 ? null : { kind: 'new' };
  return { kind: 'ratio', ratio: (current - previous) / previous, previous };
}

/** The bucket with the largest value (the earliest on a tie); none when every bucket is zero. */
export function peakBucket(series: UsageBucket[], metric: UsageMetric): UsageBucket | null {
  let peak: UsageBucket | null = null;
  for (const b of series) {
    if (metricValue(metric, b) > (peak ? metricValue(metric, peak) : 0)) peak = b;
  }
  return peak;
}

/** Value per request, for cost and tokens; none for the request count itself or with no requests. */
export function perRequest(metric: UsageMetric, t: UsageTotals): number | null {
  if (metric === 'requests' || t.calls === 0) return null;
  return metricValue(metric, t) / t.calls;
}
