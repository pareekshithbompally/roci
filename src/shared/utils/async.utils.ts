/** Bounded-concurrency primitives for item counts that grow with user data (meetings, chats, files). */

/** `Promise.all(items.map(fn))` with at most `limit` in flight: ordered results, fail-fast, stops on abort. */
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
