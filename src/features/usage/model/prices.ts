/** Prices tab: one row per model worth a price — every model you've used, and every paid model on an active provider that has
 *  no known price or your own — with the price that applies and where it comes from. */

import { modalitiesService } from '@services/modalities';
import { runsLocally } from '@extensions/usage';
import type { ProviderModelBreakdown } from '@extensions/usage';
import type { Model, ModelPrice, ModelProvider } from '@shared/types/modelProviders';

/** Where a model's price comes from, in the price rule's order. */
type PriceSource = 'free' | 'own' | 'catalog' | 'unknown';

export interface PriceRow {
  provider: string;
  modelId: string;
  /** The saved model, when its provider still lists it. */
  model: Model | undefined;
  source: PriceSource;
  /** Your price, when you set one. */
  own: ModelPrice | undefined;
  /** models.dev's price, when it has one. */
  catalog: ModelPrice | null;
}

const keyOf = (provider: string, modelId: string) => `${provider}/${modelId}`;

function rowFor(providers: ModelProvider[], provider: string, modelId: string): PriceRow {
  const model = providers.find((p) => p.provider === provider)?.models?.find((m) => m.id === modelId);
  const catalog = modalitiesService.getPricing(provider, modelId);
  const own = model?.price;
  const source: PriceSource = runsLocally(provider, modelId) ? 'free' : own ? 'own' : catalog ? 'catalog' : 'unknown';
  return { provider, modelId, model, source, own, catalog };
}

/** Used models first (as the usage log has them), then paid models on active providers that have no price or your own. */
export function priceRows(providers: ModelProvider[], used: ProviderModelBreakdown[]): PriceRow[] {
  const rows = new Map<string, PriceRow>();
  for (const u of used) rows.set(keyOf(u.provider, u.model), rowFor(providers, u.provider, u.model));
  for (const p of providers.filter((x) => x.active)) {
    for (const m of p.models ?? []) {
      const row = rowFor(providers, p.provider, m.id);
      if (row.source === 'own' || row.source === 'unknown') rows.set(keyOf(p.provider, m.id), rows.get(keyOf(p.provider, m.id)) ?? row);
    }
  }
  return [...rows.values()];
}

/** A price's fields as typed. */
export type PriceText = Record<keyof Required<ModelPrice>, string>;

const filled = (raw: string) => raw.trim() !== '';
/** A typed rate in USD, a leading `$` allowed (as prices are written). */
const amount = (raw: string) => {
  const value = Number(raw.trim().replace(/^\$/, ''));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/** A price from what was typed: `null` when every field is empty (clears it); the token rates as a pair (both, or neither when
 *  only the per-minute rate is set, as speech billed by the minute is); `undefined` when not finished (nothing is saved). */
export function parsePrice(text: PriceText): ModelPrice | null | undefined {
  const tokens = [text.inputPer1M, text.outputPer1M].filter(filled).length;
  const perMinute = filled(text.perMinute) ? amount(text.perMinute) : undefined;
  if (tokens === 0 && !filled(text.perMinute)) return null;
  if (tokens === 1 || (filled(text.perMinute) && perMinute === undefined)) return undefined;
  const inputPer1M = tokens ? amount(text.inputPer1M) : 0;
  const outputPer1M = tokens ? amount(text.outputPer1M) : 0;
  if (inputPer1M === undefined || outputPer1M === undefined) return undefined;
  return perMinute === undefined ? { inputPer1M, outputPer1M } : { inputPer1M, outputPer1M, perMinute };
}
