/** Estimated cost from token usage and models.dev pricing; 0 when pricing is unknown. */

import { modalitiesService } from '@services/modalities';
import type { ModelPricing } from '@services/modalities';
import type { TokenUsage } from '@services/ai/types';

export type { ModelPricing };

/** Pricing from the models.dev cache, loading it in the background if needed; undefined when unknown. */
export function findPricing(provider: string, model: string): ModelPricing | undefined {
  if (!modalitiesService.isLoaded()) {
    // Trigger background load so subsequent calls have data
    modalitiesService.ensureLoaded();
    return undefined;
  }
  return modalitiesService.getPricing(provider, model) ?? undefined;
}

/** Estimated USD cost; 0 when no pricing is found. */
export function estimateCost(
  provider: string,
  model: string,
  usage?: TokenUsage,
): number {
  if (!usage) return 0;

  const pricing = findPricing(provider, model);
  if (!pricing) return 0;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;

  // Cache tokens are a subset of input; they're charged at the cache rate, the rest at the standard rate.
  const standardInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const cacheReadRate = pricing.cacheReadPer1M ?? pricing.inputPer1M;
  const cacheWriteRate = pricing.cacheWritePer1M ?? pricing.inputPer1M;

  const cost =
    (standardInputTokens * pricing.inputPer1M +
      cacheReadTokens * cacheReadRate +
      cacheWriteTokens * cacheWriteRate +
      outputTokens * pricing.outputPer1M) /
    1_000_000;

  return cost;
}
