/**
 * Cost Estimation
 *
 * Looks up model pricing and calculates estimated cost from token usage.
 * Lookup: exact model ID match → longest prefix match → 0 (unknown model).
 */

import { PROVIDER_PRICING } from '@config/pricing.config';
import type { ModelPricing } from '@config/pricing.config';
import type { TokenUsage } from '@/services/ai/types';

/**
 * Find pricing for a provider + model combination.
 * 1. Exact match on model ID
 * 2. Longest prefix match (e.g., "gpt-4o-2024-11-20" matches "gpt-4o")
 * 3. Returns undefined if no match found
 */
export function findPricing(provider: string, model: string): ModelPricing | undefined {
  const providerPricing = PROVIDER_PRICING[provider];
  if (!providerPricing) return undefined;

  // Exact match
  if (providerPricing[model]) return providerPricing[model];

  // Longest prefix match
  let bestMatch: ModelPricing | undefined;
  let bestLength = 0;

  for (const key of Object.keys(providerPricing)) {
    if (model.startsWith(key) && key.length > bestLength) {
      bestMatch = providerPricing[key];
      bestLength = key.length;
    }
  }

  return bestMatch;
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
