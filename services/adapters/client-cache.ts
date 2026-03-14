/**
 * SDK Client Cache
 *
 * Caches SDK client instances keyed by apiKey + baseUrl to avoid
 * recreating clients on every request. Call clear() when settings change.
 */

const cache = new Map<string, unknown>();

function cacheKey(apiKey: string, baseUrl?: string): string {
  return `${apiKey}::${baseUrl ?? ''}`;
}

/** Get or create a cached client instance */
export function getOrCreate<T>(
  apiKey: string,
  baseUrl: string | undefined,
  factory: () => T
): T {
  const key = cacheKey(apiKey, baseUrl);
  let client = cache.get(key) as T | undefined;
  if (!client) {
    client = factory();
    cache.set(key, client);
  }
  return client;
}

/** Clear all cached clients (call on settings change) */
export function clearClientCache(): void {
  cache.clear();
}
