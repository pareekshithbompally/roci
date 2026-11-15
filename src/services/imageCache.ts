/** Remote images (model org avatars, MCP server icons): fetched once, kept on disk, so pickers never re-download them. */

import { getPlatformFetch } from '@services/platform-fetch';
import { cacheService } from '@services/storage/cache.service';
import { blobToBase64 } from '@shared/utils/audio.utils';

const cacheKey = (url: string) => `image:${url}`;

/**
 * `url` as an inline `data:` image: from the disk cache, else fetched once (following redirects) and cached.
 * Inline images pass straight through. Throws when the image can't be loaded.
 */
export async function cachedImage(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const cached = await cacheService.get<string>(cacheKey(url), 'api');
  if (cached.success && cached.data) return cached.data;

  const response = await getPlatformFetch()(url);
  if (!response.ok) throw new Error(`[imageCache] ${response.status} loading ${url}`);
  const type = response.headers.get('content-type') ?? '';
  const dataUrl = `data:${type};base64,${await blobToBase64(new Blob([await response.arrayBuffer()], { type }))}`;
  await cacheService.set(cacheKey(url), dataUrl, undefined, 'api');
  return dataUrl;
}
