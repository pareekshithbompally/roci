import { describe, it, expect, vi } from 'vitest';

vi.mock('@services/modalities', () => ({
  modalitiesService: {
    getPricing: (_provider: string, model: string) =>
      model === 'flash' ? { inputPer1M: 0.3, outputPer1M: 2.5, cacheReadPer1M: 0.03 } : null,
  },
}));

import { estimateCost } from '@extensions/usage/pricing';

const usage = { inputTokens: 11_722, outputTokens: 123, cacheReadTokens: 3_806 };

describe('estimateCost', () => {
  it('prices a cloud model from models.dev, cached input at the cache rate', () => {
    expect(estimateCost('gemini', 'flash', usage)).toBeCloseTo(0.00279648, 9);
  });

  it('leaves a cloud model with no known price unknown, not free', () => {
    expect(estimateCost('openrouter', 'new-model', usage)).toBeUndefined();
  });

  it('counts models on this Mac or your own server as free', () => {
    expect(estimateCost('on-device', 'gemma-4-e2b', usage)).toBe(0);
    expect(estimateCost('apple-intelligence', 'apple-intelligence', usage)).toBe(0);
    expect(estimateCost('local:ollama', 'gemma4:31b-cloud', usage)).toBe(0);
  });
});
