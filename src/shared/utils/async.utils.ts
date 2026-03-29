/**
 * Async Utilities
 *
 * Reusable concurrency primitives for bounded-parallel operations.
 * Use these instead of raw Promise.all(items.map(...)) when the item count
 * is unbounded or could grow with user data (meetings, chats, files).
 */

/**
 * Like `Promise.all(items.map(fn))` but with bounded concurrency.
 *
 * - Processes at most `limit` items simultaneously
 * - Returns results in original order (same contract as Promise.all)
 * - Respects AbortSignal for cancellation (skips remaining items)
 * - On individual item failure: rejects immediately (fail-fast)
 *
 * @example
 * const hashes = await concurrencyMap(
 *   meetings,
 *   (m) => computeContentHash(m),
 *   { limit: HASH_CONCURRENCY }
 * );
 */
export async function concurrencyMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { limit: number; signal?: AbortSignal },
): Promise<R[]> {
  const { limit, signal } = options;

  if (items.length === 0) return [];
  if (items.length <= limit) {
    // Fast path: no need for concurrency control
    if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
    return Promise.all(items.map((item, i) => fn(item, i)));
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let rejected = false;

  async function worker(): Promise<void> {
    while (!rejected) {
      if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

      const idx = nextIndex++;
      if (idx >= items.length) break;

      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker().catch((err) => {
      rejected = true;
      throw err;
    }),
  );

  await Promise.all(workers);
  return results;
}
