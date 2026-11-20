import { describe, it, expect, vi } from 'vitest';
import type { ModelProvider } from '@shared/types/modelProviders';

const CATALOG: Record<string, { inputPer1M: number; outputPer1M: number; cacheReadPer1M?: number }> = {
  flash: { inputPer1M: 0.3, outputPer1M: 2.5, cacheReadPer1M: 0.03 },
};
vi.mock('@services/modalities', () => ({
  modalitiesService: { getPricing: (_provider: string, model: string) => CATALOG[model] ?? null },
}));

import { costOf, priceOf } from '@extensions/usage/pricing';
import { parsePrice } from '@features/usage/model/prices';

const usage = { inputTokens: 11_722, outputTokens: 123, cacheReadTokens: 3_806 };
const providers = [
  { provider: 'openrouter', active: true, models: [{ id: 'new-model', price: { inputPer1M: 2, outputPer1M: 8 } }, { id: 'flash', price: { inputPer1M: 1, outputPer1M: 1 } }] },
] as ModelProvider[];

describe('the price rule', () => {
  it('prices a cloud model from models.dev, cached input at the cache rate', () => {
    expect(costOf(priceOf([], 'gemini', 'flash'), usage)).toBeCloseTo(0.00279648, 9);
  });

  it('uses the price the user set, over models.dev', () => {
    expect(priceOf(providers, 'openrouter', 'new-model')).toEqual({ inputPer1M: 2, outputPer1M: 8 });
    expect(priceOf(providers, 'openrouter', 'flash')).toEqual({ inputPer1M: 1, outputPer1M: 1 });
  });

  it('leaves a cloud model with no price unknown, not free', () => {
    expect(priceOf([], 'openrouter', 'mystery')).toBeNull();
    expect(costOf(null, usage)).toBeUndefined();
  });

  it('counts models on this Mac or your own server as free, but not a server\'s cloud models', () => {
    expect(costOf(priceOf([], 'on-device', 'gemma-4-e2b'), usage)).toBe(0);
    expect(costOf(priceOf([], 'apple-intelligence', 'apple-intelligence'), usage)).toBe(0);
    expect(costOf(priceOf([], 'local:ollama', 'gemma4:31b'), usage)).toBe(0);
    expect(priceOf([], 'local:ollama', 'gemma4:31b-cloud')).toBeNull();
  });
});

describe('parsePrice', () => {
  it('saves only two non-negative numbers, and clears when both are empty', () => {
    expect(parsePrice('2', '8.5')).toEqual({ inputPer1M: 2, outputPer1M: 8.5 });
    expect(parsePrice('', ' ')).toBeNull();
    expect(parsePrice('2', '')).toBeUndefined();
    expect(parsePrice('-1', '3')).toBeUndefined();
    expect(parsePrice('abc', '3')).toBeUndefined();
  });
});
