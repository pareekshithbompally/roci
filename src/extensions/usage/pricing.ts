/** The one price rule: free when a model runs on this Mac or a server you run, else the price you set, else models.dev's;
 *  unknown otherwise (never free). Every cost Roci shows or saves comes from here. */

import { modalitiesService } from '@services/modalities';
import type { ModelPricing } from '@services/modalities';
import { modelSourceOf } from '@services/ai/models';
import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { TokenUsage } from '@services/ai/types';
import type { ModelProvider } from '@shared/types/modelProviders';

const FREE: ModelPricing = { inputPer1M: 0, outputPer1M: 0, perMinute: 0 };

/** On this Mac or a server you run, and not passed on to its maker's cloud (Ollama's `-cloud` models are). */
export const runsLocally = (provider: string, modelId: string): boolean =>
  modelSourceOf(provider) !== 'cloud' && !MODEL_SPINE_CONFIG.cloudModelSuffix.test(modelId);

/** The price the user set for a model, from its saved provider. */
const userPrice = (providers: ModelProvider[], provider: string, modelId: string) =>
  providers.find((p) => p.provider === provider)?.models?.find((m) => m.id === modelId)?.price;

/** A model's price per 1M tokens, from the loaded models.dev list and the user's prices; null when unknown. */
export function priceOf(providers: ModelProvider[], provider: string, modelId: string): ModelPricing | null {
  if (runsLocally(provider, modelId)) return FREE;
  return userPrice(providers, provider, modelId) ?? modalitiesService.getPricing(provider, modelId);
}

/** USD for a call's tokens and audio minutes at `price`; undefined when the price, or what the call is billed by, is unknown. */
export function costOf(price: ModelPricing | null, usage?: TokenUsage, audioSeconds = 0): number | undefined {
  if (!price) return undefined;
  const minutes = audioSeconds > 0 && price.perMinute !== undefined ? (audioSeconds / 60) * price.perMinute : undefined;
  if (!usage) return minutes;
  return tokenCost(price, usage) + (minutes ?? 0);
}

/** USD for `usage`'s tokens at `price`. Cached input is a subset of input, at the cache rate. */
function tokenCost(price: ModelPricing, usage: TokenUsage): number {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const standardInput = Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite);
  return (
    standardInput * price.inputPer1M +
    cacheRead * (price.cacheReadPer1M ?? price.inputPer1M) +
    cacheWrite * (price.cacheWritePer1M ?? price.inputPer1M) +
    (usage.outputTokens ?? 0) * price.outputPer1M
  ) / 1_000_000;
}
