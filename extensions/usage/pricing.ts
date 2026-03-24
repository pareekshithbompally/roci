/**
 * Cost Estimation
 *
 * Looks up model pricing from models.dev (via modalitiesService cache) and
 * calculates estimated cost from token usage. Returns 0 if pricing data is
 * not available for the provider/model.
 */

import { modalitiesService } from '@/services/modalities';
import type { ModelPricing } from '@/services/modalities';
import type { TokenUsage } from '@/services/ai/types';

export type { ModelPricing };

/**
 * Find pricing for a provider + model combination via models.dev cache.
 * If the cache isn't loaded yet, triggers a background load for future calls.
 * Returns undefined if no pricing data is available.
 */
export function findPricing(provider: string, model: string): ModelPricing | undefined {
  if (!modalitiesService.isLoaded()) {
    // Trigger background load so subsequent calls have data
    modalitiesService.ensureLoaded();
    return undefined;
  }
  return modalitiesService.getPricing(provider, model) ?? undefined;
}

/**
 * Estimate cost in USD from token usage and model pricing.
 * Returns 0 if no pricing data is found for the provider/model.
 */
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

  // Cache tokens are a subset of input tokens. If cache pricing exists,
  // charge cache tokens at the cache rate and the remainder at the standard rate.
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
