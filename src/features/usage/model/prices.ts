/** Model Prices: the models that need a price from the user, and the ones they priced. */

import { modalitiesService } from '@services/modalities';
import { runsLocally } from '@extensions/usage';
import type { Model, ModelPrice, ModelProvider } from '@shared/types/modelProviders';

/** A model on the Model Prices page, with the provider it's saved under. */
export interface PricedModel {
  provider: string;
  model: Model;
}

/** Every paid model on an active provider: those models.dev has no price for, and those the user priced. */
export function modelsToPrice(providers: ModelProvider[]): { unpriced: PricedModel[]; own: PricedModel[] } {
  const paid = providers
    .filter((p) => p.active)
    .flatMap((p) => (p.models ?? []).map((model) => ({ provider: p.provider, model })))
    .filter(({ provider, model }) => !runsLocally(provider, model.id));
  return {
    unpriced: paid.filter(({ provider, model }) => !model.price && !modalitiesService.getPricing(provider, model.id)),
    own: paid.filter(({ model }) => !!model.price),
  };
}

/** A price from what was typed: both rates as non-negative numbers, `null` when both are empty (clears it), else `undefined`
 *  (not finished yet: nothing is saved). */
export function parsePrice(input: string, output: string): ModelPrice | null | undefined {
  if (!input.trim() && !output.trim()) return null;
  const inputPer1M = Number(input);
  const outputPer1M = Number(output);
  const valid = (n: number, raw: string) => raw.trim() !== '' && Number.isFinite(n) && n >= 0;
  return valid(inputPer1M, input) && valid(outputPer1M, output) ? { inputPer1M, outputPer1M } : undefined;
}
