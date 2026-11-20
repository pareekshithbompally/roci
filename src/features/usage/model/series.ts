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

/** A recorded use case as the app names it now (older names count as the call they became). */
const useCaseOf = (category: string): string => USAGE_CONFIG.useCaseAliases[category as keyof typeof USAGE_CONFIG.useCaseAliases] ?? category;

/** A use case's name; one the app doesn't name shows as it was recorded. */
export const useCaseName = (category: string): string => USAGE_CONFIG.useCases[category as UsageCategory] ?? category;

export type UsageSplit = 'model' | 'provider' | 'useCase';

/** What a slice stands for, so it can show its icon. */
export type SplitMark =
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'provider'; provider: string }
  | { kind: 'useCase'; category: string };

/** One slice of a split, with its totals. */
export interface SplitEntry extends UsageTotals {
  key: string;
  name: string;
  /** Calls with no known price, left out of its cost. */
  unpriced: number;
  /** None for "Other". */
  mark: SplitMark | null;
}

type Row = UsageTotals & { unpriced_calls: number };

/** The window's rows as slices of a split, summed per slice. */
function entriesOf(summary: UsageSummary, split: UsageSplit): SplitEntry[] {
  const byKey = new Map<string, SplitEntry>();
  const add = (key: string, name: string, mark: SplitMark, row: Row) => {
    const entry = byKey.get(key) ?? { key, name, mark, calls: 0, estimated_cost: 0, unpriced: 0 };
    entry.calls += row.calls;
    entry.estimated_cost += row.estimated_cost;
    entry.unpriced += row.unpriced_calls;
    byKey.set(key, entry);
  };
  if (split === 'useCase') {
    for (const c of summary.by_category) {
      const category = useCaseOf(c.category);
      add(category, useCaseName(category), { kind: 'useCase', category }, c);
    }
  } else {
    for (const m of summary.by_provider_model) {
      if (split === 'model') add(`${m.provider}/${m.model}`, modelName(m.model), { kind: 'model', provider: m.provider, model: m.model }, m);
      else add(m.provider, getProviderTitle(m.provider), { kind: 'provider', provider: m.provider }, m);
    }
  }
  return [...byKey.values()];
}

/** Entries past `max` folded into one "Other". */
function fold(ranked: SplitEntry[], max: number): SplitEntry[] {
  if (ranked.length <= max) return ranked;
  const other: SplitEntry = { key: 'other', name: USAGE_CONFIG.copy.other, mark: null, calls: 0, estimated_cost: 0, unpriced: 0 };
  for (const e of ranked.slice(max - 1)) {
    other.calls += e.calls;
    other.estimated_cost += e.estimated_cost;
    other.unpriced += e.unpriced;
  }
  return [...ranked.slice(0, max - 1), other];
}

/** A split as the donut shows it for a measure. */
export interface SplitView {
  slices: SplitEntry[];
  /** Cost only: the entries that cost nothing (ran free), left out of the ring. */
  free: { count: number; calls: number } | null;
}

/** A split's slices, largest by cost (then requests) in that fixed order whichever measure shows, so each keeps its colour;
 *  past the palette's slots the rest fold into "Other". By cost, entries that ran free leave the ring for one note line. */
export function splitView(summary: UsageSummary, split: UsageSplit, measure: UsageMeasure): SplitView {
  const ranked = entriesOf(summary, split).sort((a, b) => b.estimated_cost - a.estimated_cost || b.calls - a.calls);
  const max = UI_CONFIG.chart.maxSlices;
  if (measure === 'requests') return { slices: fold(ranked, max), free: null };
  const costed = ranked.filter((e) => e.estimated_cost > 0 || e.unpriced > 0);
  const free = ranked.filter((e) => !costed.includes(e));
  if (free.length === 0) return { slices: fold(costed, max), free: null };
  return { slices: fold(costed, max - 1), free: { count: free.length, calls: free.reduce((n, e) => n + e.calls, 0) } };
}
