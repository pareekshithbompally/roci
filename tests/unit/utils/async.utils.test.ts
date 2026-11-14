import { describe, it, expect } from 'vitest';
import { concurrencyMap } from '@shared/utils/async.utils';

describe('concurrencyMap', () => {
  it('returns empty array for empty input', async () => {
    const result = await concurrencyMap([], async (x) => x, { limit: 3 });
    expect(result).toEqual([]);
  });

  it('processes all items when count <= limit (fast path)', async () => {
    const items = [1, 2, 3];
    const result = await concurrencyMap(items, async (x) => x * 2, { limit: 5 });
    expect(result).toEqual([2, 4, 6]);
  });

  it('processes all items when count equals limit', async () => {
    const items = [10, 20, 30];
    const result = await concurrencyMap(items, async (x) => x + 1, { limit: 3 });
    expect(result).toEqual([11, 21, 31]);
  });

  it('preserves order with concurrency', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    // Items with varying delays — order must still be preserved
    const result = await concurrencyMap(
      items,
      async (x, i) => {
        // Reverse delay: first items take longer
        await new Promise((r) => setTimeout(r, (items.length - i) * 5));
        return x * 10;
      },
      { limit: 2 },
    );
    expect(result).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('respects concurrency limit', async () => {
    let activeConcurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await concurrencyMap(
      items,
      async (x) => {
        activeConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
        await new Promise((r) => setTimeout(r, 20));
        activeConcurrent--;
        return x;
      },
      { limit: 3 },
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThanOrEqual(2); // Should actually use concurrency
  });

  it('passes correct index to callback', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const indices: number[] = [];
    await concurrencyMap(
      items,
      async (_, i) => {
        indices.push(i);
        return i;
      },
      { limit: 2 },
    );
    // All indices should be present (order may vary due to concurrency)
    expect(indices.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  describe('abort signal', () => {
    it('throws immediately if signal is already aborted (fast path)', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        concurrencyMap([1, 2], async (x) => x, { limit: 5, signal: controller.signal }),
      ).rejects.toThrow('aborted');
    });

    it('throws immediately if signal is already aborted (worker path)', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        concurrencyMap([1, 2, 3, 4, 5], async (x) => x, { limit: 2, signal: controller.signal }),
      ).rejects.toThrow('aborted');
    });

    it('aborts mid-flight when signal fires', async () => {
      const controller = new AbortController();
      let processedCount = 0;

      const promise = concurrencyMap(
        Array.from({ length: 20 }, (_, i) => i),
        async (x) => {
          await new Promise((r) => setTimeout(r, 20));
          processedCount++;
          if (processedCount >= 3) {
            controller.abort();
          }
          return x;
        },
        { limit: 2, signal: controller.signal },
      );

      await expect(promise).rejects.toThrow('aborted');
      // Should not have processed all 20 items
      expect(processedCount).toBeLessThan(20);
    });
  });

  describe('error handling', () => {
    it('rejects on first error (fail-fast)', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      let processedAfterError = 0;

      const promise = concurrencyMap(
        items,
        async (x) => {
          await new Promise((r) => setTimeout(r, 10));
          if (x === 3) throw new Error('boom');
          if (x > 3) processedAfterError++;
          return x;
        },
        { limit: 2 },
      );

      await expect(promise).rejects.toThrow('boom');
    });

    it('error in fast path rejects the promise', async () => {
      await expect(
        concurrencyMap(
          [1, 2],
          async (x) => {
            if (x === 2) throw new Error('fast-path-error');
            return x;
          },
          { limit: 5 },
        ),
      ).rejects.toThrow('fast-path-error');
    });
  });

  it('handles single item', async () => {
    const result = await concurrencyMap([42], async (x) => x * 2, { limit: 3 });
    expect(result).toEqual([84]);
  });

  it('handles limit of 1 (sequential)', async () => {
    let maxConcurrent = 0;
    let active = 0;
    const items = [1, 2, 3, 4, 5];

    const result = await concurrencyMap(
      items,
      async (x) => {
        active++;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return x * 2;
      },
      { limit: 1 },
    );

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(maxConcurrent).toBe(1);
  });
});
