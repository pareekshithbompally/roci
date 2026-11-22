/** Usage maths: every figure on screen derives from the recorded totals and buckets here, nowhere else. */

import { USAGE_CONFIG, type UsageMeasure } from '@config/usage.config';
import { UI_CONFIG } from '@config/ui.config';
import type { UsageBucket, UsageCategory, UsageSummary } from '@extensions/usage';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { modelSourceOf } from '@services/ai/models';
import { formatToolName } from '@features/chat';

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

/** A provider's name on this page: a server you run says so, as the same maker may also be a cloud provider. */
export const providerName = (provider: string): string =>
  modelSourceOf(provider) === 'your-server' ? USAGE_CONFIG.copy.yourServer(getProviderTitle(provider)) : getProviderTitle(provider);

/** A tool's name in sentence case ("Web search exa", "Google search web"). */
export const toolName = (tool: string): string => {
  const words = formatToolName(tool).toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A use case's name; one the app doesn't name shows as it was recorded. */
const useCaseName = (category: string): string => USAGE_CONFIG.useCases[category as UsageCategory] ?? category;

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
  mark: SplitMark;
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
      add(c.category, useCaseName(c.category), { kind: 'useCase', category: c.category }, c);
    }
  } else {
    for (const m of summary.by_provider_model) {
      if (split === 'model') add(`${m.provider}/${m.model}`, modelName(m.model), { kind: 'model', provider: m.provider, model: m.model }, m);
      else add(m.provider, providerName(m.provider), { kind: 'provider', provider: m.provider }, m);
    }
  }
  return [...byKey.values()];
}

/** A split's entries, largest first by the measure shown (then the other), each with its colour slot: its rank by cost
 *  then requests, which doesn't change with the measure, so an entry keeps its colour; past the palette, none (neutral). */
export function splitEntries(summary: UsageSummary, split: UsageSplit, measure: UsageMeasure): Array<SplitEntry & { slot?: number }> {
  const entries = entriesOf(summary, split);
  const byCost = [...entries].sort((a, b) => b.estimated_cost - a.estimated_cost || b.calls - a.calls);
  const slotOf = new Map(byCost.map((e, i) => [e.key, i < UI_CONFIG.chart.seriesSlots ? i + 1 : undefined]));
  const other: UsageMeasure = measure === 'cost' ? 'requests' : 'cost';
  return entries
    .sort((a, b) => measureOf(measure, b) - measureOf(measure, a) || measureOf(other, b) - measureOf(other, a))
    .map((e) => ({ ...e, slot: slotOf.get(e.key) }));
}
