/** Files on disk: kept assets (one row each in roci.db), recordings read back, the cache and app-data paths. */

import { pathsService } from './paths.service';
import { cacheService } from './cache.service';

export { pathsService } from './paths.service';
export { recordingsService } from './recordings.service';
export { imagesService } from './images.service';
export { mediaService } from './media.service';
export type { GalleryMedia, MediaKind as GalleryMediaKind, SpeechMeta } from './media.service';
export { documentsService, documentFormat } from './documents.service';
export type { DocumentFormat, KnowledgeDocument } from './documents.service';
export { assetsService } from './assets.service';
export type { AssetKind, SavedAsset } from './assets.service';
export { cacheService } from './cache.service';

export type { CacheEntry, StorageResult } from './types';

/** Creates the cache directories and clears expired cache entries. */
export async function initializeStorage(): Promise<void> {
  console.log('[Storage] ========== Initializing storage system ==========');

  const result = await pathsService.initialize();

  if (!result.success) {
    console.error('[Storage] ❌ FAILED to initialize storage:', result.error);
    throw new Error('Storage initialization failed: ' + result.error);
  }

  console.log('[Storage] ✓ Storage initialized at:', result.data);

  const cacheCleanup = await cacheService.clearExpired();
  if (cacheCleanup.success && cacheCleanup.data) {
    console.log('[Storage] ✓ Cleaned up', cacheCleanup.data, 'expired cache entries');
  }

  console.log('[Storage] ========== Storage initialization complete ==========');
}
