/** Estimated cost from token usage: free on this Mac or your own server, models.dev's price for a cloud model. */

import { modalitiesService } from '@services/modalities';
import { modelSourceOf } from '@services/ai/models';
import type { TokenUsage } from '@services/ai/types';

/** Estimated USD cost from the loaded models.dev list; undefined when a cloud model's price or tokens are unknown
 *  (unknown is not free). */
export function estimateCost(provider: string, model: string, usage?: TokenUsage): number | undefined {
  if (modelSourceOf(provider) !== 'cloud') return 0;
  const pricing = modalitiesService.getPricing(provider, model);
  if (!pricing || !usage) return undefined;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;

  // Cache tokens are a subset of input; they're charged at the cache rate, the rest at the standard rate.
  const standardInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const cacheReadRate = pricing.cacheReadPer1M ?? pricing.inputPer1M;
  const cacheWriteRate = pricing.cacheWritePer1M ?? pricing.inputPer1M;

  return (
    standardInputTokens * pricing.inputPer1M +
    cacheReadTokens * cacheReadRate +
    cacheWriteTokens * cacheWriteRate +
    outputTokens * pricing.outputPer1M
  ) / 1_000_000;
}
