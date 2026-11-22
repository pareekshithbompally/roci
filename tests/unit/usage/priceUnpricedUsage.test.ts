/** A price set later fills earlier unpriced calls by the same `costOf` a call is logged with. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@services/tauri', () => ({ isTauriEnvironment: () => true }));
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries } }));

import { priceUnpricedUsage } from '@extensions/usage';

const row = (id: string, tokens: [number, number, number], audio_seconds = 0) => ({
  id, input_tokens: tokens[0], output_tokens: tokens[1], cache_read_tokens: tokens[2], cache_write_tokens: 0, audio_seconds,
});

function answer(rows: ReturnType<typeof row>[]) {
  invoke.mockImplementation(async (command: string) => (command === 'plugin:store|unpriced_usage' ? rows : rows.length));
}

const saved = () => invoke.mock.calls.find(([command]) => command === 'plugin:store|set_usage_costs')?.[1];

describe('priceUnpricedUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prices tokens as a newly logged call: cached input at the input rate when the price has no cache rate', async () => {
    answer([row('a', [1_000_000, 500_000, 400_000])]);
    await priceUnpricedUsage('openrouter', 'm', { inputPer1M: 2, outputPer1M: 8 });
    // 1M in at $2 + 0.5M out at $8
    expect(saved()).toEqual({ costs: [{ id: 'a', cost: 6 }] });
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it('a speech call is billed by its minutes, and stays unknown without a per-minute rate', async () => {
    answer([row('s', [0, 0, 0], 90)]);
    await priceUnpricedUsage('openai', 'whisper-1', { inputPer1M: 2, outputPer1M: 8 });
    expect(saved()).toBeUndefined();

    await priceUnpricedUsage('openai', 'whisper-1', { inputPer1M: 0, outputPer1M: 0, perMinute: 0.006 });
    expect(saved().costs[0].cost).toBeCloseTo(0.009);
  });
});
