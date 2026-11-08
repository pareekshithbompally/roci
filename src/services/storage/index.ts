/**
 * Storage Services - Central Export
 * Binary file services (cache, recordings, paths) for the app.
 * Data persistence is handled by kasset.db via @services/db.
 */

import { pathsService } from './paths.service';
import { cacheService } from './cache.service';

export { pathsService } from './paths.service';
export { recordingsService } from './recordings.service';
export { cacheService } from './cache.service';

export type {
  BaseMetadata,
  RecordingMetadata,
  AppSettings,
  CacheEntry,
  CacheStats,
  StorageResult,
  DirectoryInfo,
  FileOperationOptions,
} from './types';

/**
 * Initialize storage — creates directories for recordings and cache.
 */
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
