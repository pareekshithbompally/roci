/** Usage maths: every figure on screen derives from the recorded totals and buckets here, nowhere else. */

import { USAGE_CONFIG, type UsageMeasure } from '@config/usage.config';
import { UI_CONFIG } from '@config/ui.config';
import type { UsageBucket, UsageCategory, UsageSummary } from '@extensions/usage';
import { getProviderTitle } from '@shared/utils/provider.utils';

/** The sums a split entry or a bucket carries. */
export interface UsageTotals {
  calls: number;
  estimated_cost: number;
}

/** The number a measure reads: cost, or the request count. */
export const measureOf = (measure: UsageMeasure, t: UsageTotals): number => (measure === 'cost' ? t.estimated_cost : t.calls);

const EMPTY_BUCKET = { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, estimated_cost: 0 };

/** One bucket per key, oldest first; keys with no records read as zero, so the axis is continuous. */
export function fillSeries(keys: string[], trend: UsageBucket[]): UsageBucket[] {
  const byKey = new Map(trend.map((b) => [b.key, b]));
  return keys.map((key) => byKey.get(key) ?? { key, ...EMPTY_BUCKET });
}

/** Model id without its org prefix ("ggml-org/gemma…" → "gemma…"). */
export const modelName = (id: string) => id.slice(id.lastIndexOf('/') + 1);

/** A recorded use case's name; one the app doesn't name shows as it was recorded. */
export const useCaseName = (category: string): string => USAGE_CONFIG.useCases[category as UsageCategory] ?? category;

export type UsageSplit = 'model' | 'provider' | 'useCase';

/** One named entry of a split, with its totals. */
export interface SplitEntry extends UsageTotals {
  name: string;
}

/** Totals summed per name. */
function sumByName(rows: Array<UsageTotals & { name: string }>): SplitEntry[] {
  const byName = new Map<string, SplitEntry>();
  for (const row of rows) {
    const entry = byName.get(row.name) ?? { name: row.name, calls: 0, estimated_cost: 0 };
    entry.calls += row.calls;
    entry.estimated_cost += row.estimated_cost;
    byName.set(row.name, entry);
  }
  return [...byName.values()];
}

/** The window's totals split by model, provider or use case. */
function entriesOf(summary: UsageSummary, split: UsageSplit): SplitEntry[] {
  if (split === 'useCase') return sumByName(summary.by_category.map((c) => ({ ...c, name: useCaseName(c.category) })));
  const name = split === 'model' ? (m: { model: string }) => modelName(m.model) : (m: { provider: string }) => getProviderTitle(m.provider);
  return sumByName(summary.by_provider_model.map((m) => ({ calls: m.calls, estimated_cost: m.estimated_cost, name: name(m) })));
}

/** A split's slices: the largest by cost (then requests) in that fixed order whichever measure shows, so each keeps its colour
 *  when the measure changes; past the palette's slots the rest fold into one "Other". */
export function splitSlices(summary: UsageSummary, split: UsageSplit): SplitEntry[] {
  const ranked = entriesOf(summary, split).sort((a, b) => b.estimated_cost - a.estimated_cost || b.calls - a.calls);
  const max = UI_CONFIG.chart.maxSlices;
  if (ranked.length <= max) return ranked;
  const rest = ranked.slice(max - 1);
  const other = { name: USAGE_CONFIG.copy.other, ...rest.reduce((t, e) => ({ calls: t.calls + e.calls, estimated_cost: t.estimated_cost + e.estimated_cost }), { calls: 0, estimated_cost: 0 }) };
  return [...ranked.slice(0, max - 1), other];
}
