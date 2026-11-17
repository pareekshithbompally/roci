import { describe, expect, it } from 'vitest';
import { changeFrom, fillSeries, metricValue, peakBucket, perRequest, totalsByProvider } from '@features/usage/model/series';
import { formatChange, formatMetric, formatTick, usageLine } from '@features/usage/model/format';
import type { UsageBucket } from '@extensions/usage';

const bucket = (key: string, calls: number, cost: number, input = 0, output = 0): UsageBucket =>
  ({ key, calls, input_tokens: input, output_tokens: output, cache_read_tokens: 0, estimated_cost: cost });

describe('usage series', () => {
  it('fills missing days with zero and keeps the recorded ones exactly', () => {
    const series = fillSeries(['a', 'b', 'c'], [bucket('a', 2, 0.1), bucket('c', 1, 0.2)]);
    expect(series.map((b) => b.calls)).toEqual([2, 0, 1]);
    expect(series.reduce((s, b) => s + b.estimated_cost, 0)).toBeCloseTo(0.3, 12);
  });

  it('reads each metric from the same totals', () => {
    const t = bucket('x', 4, 0.5, 100, 20);
    expect([metricValue('cost', t), metricValue('requests', t), metricValue('tokens', t)]).toEqual([0.5, 4, 120]);
    expect(perRequest('cost', t)).toBe(0.125);
    expect(perRequest('requests', t)).toBeNull();
    expect(perRequest('cost', bucket('y', 0, 0))).toBeNull();
  });

  it('finds the earliest peak and none in an empty series', () => {
    expect(peakBucket([bucket('a', 1, 0.1), bucket('b', 3, 0.3), bucket('c', 3, 0.3)], 'requests')?.key).toBe('b');
    expect(peakBucket([bucket('a', 0, 0)], 'cost')).toBeNull();
  });

  it('compares with the previous window honestly', () => {
    expect(changeFrom(0.3, 0.24)).toEqual({ kind: 'ratio', ratio: expect.closeTo(0.25, 12), previous: 0.24 });
    expect(changeFrom(5, 0)).toEqual({ kind: 'new' });
    expect(changeFrom(0, 0)).toBeNull();
    expect(formatChange({ kind: 'ratio', ratio: 0.25, previous: 1 })).toMatch(/^\+25\s?%$/);
    expect(formatChange({ kind: 'ratio', ratio: -0.5, previous: 1 })).toMatch(/^[-−]50\s?%$/);
  });

  it('sums providers across their models', () => {
    const rows = [
      { provider: 'g', model: 'a', calls: 2, input_tokens: 10, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, estimated_cost: 0.1 },
      { provider: 'o', model: 'b', calls: 1, input_tokens: 5, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, estimated_cost: 0.5 },
      { provider: 'g', model: 'c', calls: 3, input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, estimated_cost: 0.2 },
    ];
    expect(totalsByProvider(rows).map((p) => [p.provider, p.calls])).toEqual([['o', 1], ['g', 5]]);
  });

  it('formats values, ticks and row lines', () => {
    expect(formatMetric('cost', 0)).toBe('Free');
    expect(formatMetric('tokens', 253_900)).toBe('253.9k');
    expect(formatTick('cost', 0.025, 0.025)).toBe('$0.025');
    expect(formatTick('cost', 0.04, 0.02)).toBe('$0.04');
    expect(formatTick('requests', 0, 5)).toBe('0');
    expect(usageLine({ calls: 1, input_tokens: 0, output_tokens: 0, estimated_cost: 0 })).toBe('1 request');
    expect(usageLine({ calls: 72, input_tokens: 239_300, output_tokens: 42_000, estimated_cost: 0 }, 'Gemini')).toBe('Gemini · 72 requests · 239.3k in · 42.0k out');
  });
});
