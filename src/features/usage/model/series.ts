/** Usage maths: every figure on screen derives from the recorded totals and buckets here, nowhere else. */

import { USAGE_CONFIG, type UsageMeasure, type UsageSplitBy } from '@config/usage.config';
import type { UsageBucket, UsageBucketPart, UsageCategory, UsageSummary } from '@extensions/usage';
import type { BarLayer } from '@shared/ui';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { modelSourceOf } from '@services/ai/models';
import { formatToolName } from '@features/chat';

/** The sums a part or a bucket carries. */
export interface UsageTotals {
  calls: number;
  estimated_cost: number;
}

/** The number a measure reads: cost, or the request count. */
export const measureOf = (measure: UsageMeasure, t: UsageTotals): number => (measure === 'cost' ? t.estimated_cost : t.calls);

/** What the page leads with: cost once anything cost money, else requests (local and free models only). */
export const leadMeasure = (summary: UsageSummary): UsageMeasure => (summary.total_cost > 0 ? 'cost' : 'requests');

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
export const useCaseName = (category: string): string => USAGE_CONFIG.useCases[category as UsageCategory] ?? category;

/** What a part stands for, so it can show its icon and open its page. */
export type PartMark = { kind: 'model'; provider: string; model: string } | { kind: 'useCase'; category: string };

/** One model or use case over the period (or a picked day). */
export interface UsagePart extends UsageTotals {
  /** `provider/model`, or the use case. */
  key: string;
  name: string;
  mark: PartMark;
  tokens: number;
  /** Calls with no known price, left out of its cost. */
  unpriced: number;
  /** Its colour (`--viz-1` …) by its rank in the period, the same on the chart, its row and its page; `--viz-other` past the
   *  coloured few. */
  token: string;
}

const OTHER_TOKEN = '--viz-other';

const modelMark = (provider: string, model: string): PartMark => ({ kind: 'model', provider, model });
const useCaseMark = (category: string): PartMark => ({ kind: 'useCase', category });

/** Largest first by `measure`, then by the other measure. */
function byMeasure(measure: UsageMeasure) {
  const other: UsageMeasure = measure === 'cost' ? 'requests' : 'cost';
  return (a: UsageTotals, b: UsageTotals) => measureOf(measure, b) - measureOf(measure, a) || measureOf(other, b) - measureOf(other, a);
}

/** The period's models or use cases, largest first by `measure`, each with its colour. */
export function partsOf(summary: UsageSummary, splitBy: UsageSplitBy, measure: UsageMeasure): UsagePart[] {
  const raw: Array<Omit<UsagePart, 'token'>> = splitBy === 'model'
    ? summary.by_provider_model.map((m) => ({
      key: `${m.provider}/${m.model}`, name: modelName(m.model), mark: modelMark(m.provider, m.model),
      calls: m.calls, estimated_cost: m.estimated_cost, tokens: m.input_tokens + m.output_tokens, unpriced: m.unpriced_calls,
    }))
    : summary.by_category.map((c) => ({
      key: c.category, name: useCaseName(c.category), mark: useCaseMark(c.category),
      calls: c.calls, estimated_cost: c.estimated_cost, tokens: c.input_tokens + c.output_tokens, unpriced: c.unpriced_calls,
    }));
  return raw.sort(byMeasure(measure)).map((p, i) => ({ ...p, token: i < USAGE_CONFIG.coloredParts ? `--viz-${i + 1}` : OTHER_TOKEN }));
}

const bucketPartsOf = (summary: UsageSummary, splitBy: UsageSplitBy): UsageBucketPart[] =>
  (splitBy === 'model' ? summary.trend_by_model : summary.trend_by_use_case);

/** `values[i]`: what the matching bucket parts add to key `keys[i]`. */
function perKey(keys: string[], parts: UsageBucketPart[], measure: UsageMeasure): number[] {
  const index = new Map(keys.map((key, i) => [key, i]));
  const values = keys.map(() => 0);
  for (const part of parts) {
    const i = index.get(part.key);
    if (i !== undefined) values[i] += measureOf(measure, part);
  }
  return values;
}

/** The lead chart's layers: each coloured part per bucket, largest at the base, then the rest together as Other. */
export function stackLayers(summary: UsageSummary, parts: UsagePart[], splitBy: UsageSplitBy, keys: string[], measure: UsageMeasure): BarLayer[] {
  const all = bucketPartsOf(summary, splitBy);
  const colored = parts.filter((p) => p.token !== OTHER_TOKEN);
  const named = new Set(colored.map((p) => p.key));
  const layers = colored.map((p) => ({ name: p.name, token: p.token, data: perKey(keys, all.filter((b) => b.part === p.key), measure) }));
  const rest = perKey(keys, all.filter((b) => !named.has(b.part)), measure);
  return rest.some((v) => v > 0) ? [...layers, { name: USAGE_CONFIG.copy.other, token: OTHER_TOKEN, data: rest }] : layers;
}

/** One model's or use case's values per bucket. */
export const partSeries = (summary: UsageSummary, splitBy: UsageSplitBy, key: string, keys: string[], measure: UsageMeasure): number[] =>
  perKey(keys, bucketPartsOf(summary, splitBy).filter((b) => b.part === key), measure);

/** A picked day's parts: that day's own totals, largest first, each keeping its period colour. */
export function dayParts(summary: UsageSummary, parts: UsagePart[], splitBy: UsageSplitBy, day: string, measure: UsageMeasure): UsagePart[] {
  const known = new Map(parts.map((p) => [p.key, p]));
  return bucketPartsOf(summary, splitBy)
    .filter((b) => b.key === day && known.has(b.part))
    .map((b) => ({ ...known.get(b.part)!, calls: b.calls, estimated_cost: b.estimated_cost, tokens: b.tokens, unpriced: 0 }))
    .sort(byMeasure(measure));
}

/** What a model was used for, or which models a use case used: one part per pairing, largest first, each in its colour
 *  from the other split's ranking (`others`), so Chat is Chat's colour on every page. */
export function pairedParts(summary: UsageSummary, mark: PartMark, others: UsagePart[], measure: UsageMeasure): UsagePart[] {
  const tokenOf = new Map(others.map((p) => [p.key, p.token]));
  const rows = mark.kind === 'model'
    ? summary.by_model_use_case.filter((r) => r.provider === mark.provider && r.model === mark.model)
      .map((r) => ({ key: r.category, name: useCaseName(r.category), mark: useCaseMark(r.category), r }))
    : summary.by_model_use_case.filter((r) => r.category === mark.category)
      .map((r) => ({ key: `${r.provider}/${r.model}`, name: modelName(r.model), mark: modelMark(r.provider, r.model), r }));
  return rows
    .map(({ key, name, mark: m, r }) => ({ key, name, mark: m, calls: r.calls, estimated_cost: r.estimated_cost, tokens: r.tokens, unpriced: 0, token: tokenOf.get(key) ?? OTHER_TOKEN }))
    .sort(byMeasure(measure));
}

/** The bucket with the most of `measure`, if any has some. */
export function busiest(series: UsageBucket[], measure: UsageMeasure): UsageBucket | null {
  const top = series.reduce<UsageBucket | null>((best, b) => (measureOf(measure, b) > (best ? measureOf(measure, best) : 0) ? b : best), null);
  return top;
}
