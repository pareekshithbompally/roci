import { describe, expect, it } from 'vitest';
import { niceTicks } from '@shared/utils/niceTicks';

describe('niceTicks', () => {
  it('rounds to nice steps that cover the maximum', () => {
    expect(niceTicks(0.041, 2)).toEqual([0, 0.025, 0.05]);
    expect(niceTicks(0.04, 2)).toEqual([0, 0.02, 0.04]);
    expect(niceTicks(173, 2)).toEqual([0, 100, 200]);
    expect(niceTicks(9, 2)).toEqual([0, 5, 10]);
  });
  it('keeps count axes whole', () => {
    expect(niceTicks(3, 2, true)).toEqual([0, 2, 4]);
    expect(niceTicks(1, 2, true)).toEqual([0, 1]);
  });
  it('gives an empty series a unit axis', () => {
    expect(niceTicks(0, 2)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN, 2)).toEqual([0, 1]);
  });
  it('always ends at or above the maximum', () => {
    for (const max of [0.0003, 0.7, 1, 1.5, 12, 999, 123456]) {
      const ticks = niceTicks(max, 2);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
});
