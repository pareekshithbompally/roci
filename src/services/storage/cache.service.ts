/** Temporary audio/API data with TTL and size limits. */

import { writeFile, readFile, remove, exists, readDir } from '@tauri-apps/plugin-fs';
import { StorageConfig, generateCacheFilename } from '@config/storage.config';
import { pathsService } from './paths.service';
import type { CacheEntry, StorageResult } from './types';

class CacheService {
  async set<T>(
    key: string,
    data: T,
    ttlMs?: number,
    category: 'audio' | 'api' = 'api'
  ): Promise<StorageResult> {
    try {
      const path = category === 'audio' 
        ? await pathsService.getAudioCachePath()
        : await pathsService.getApiCachePath();

      const filename = generateCacheFilename(key, '.json');
      const fullPath = `${path}${filename}`;

      // Calculate expiration based on category defaults or custom TTL
      const defaultTtl = category === 'audio'
        ? StorageConfig.cache.audio.ttlHours * 60 * 60 * 1000
        : StorageConfig.cache.api.ttlDays * 24 * 60 * 60 * 1000;
      
      const expirationMs = ttlMs || defaultTtl;
      const expiresAt = new Date(Date.now() + expirationMs).toISOString();

      const cacheEntry: CacheEntry<T> = {
        key,
        data,
        createdAt: new Date().toISOString(),
        expiresAt,
        size: 0, // will be set from actual serialization
      };

      const json = JSON.stringify(cacheEntry);
      cacheEntry.size = json.length;

      await writeFile(
        fullPath,
        new TextEncoder().encode(json)
      );

      // Check if we need to cleanup due to size limits
      await this.enforceStorageSize(category);

      return { success: true };
    } catch (error) {
      console.error('[CacheService] Failed to set cache:', error);
      return {
        success: false,
        error: `Failed to set cache: ${error}`,
      };
    }
  }

  /** The entry when present and not expired. */
  async get<T>(key: string, category: 'audio' | 'api' = 'api'): Promise<StorageResult<T>> {
    try {
      const path = category === 'audio' 
        ? await pathsService.getAudioCachePath()
        : await pathsService.getApiCachePath();

      const filename = generateCacheFilename(key, '.json');
      const fullPath = `${path}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return {
          success: false,
          error: 'Cache entry not found',
        };
      }

      const fileData = await readFile(fullPath);
      const cacheEntry = JSON.parse(new TextDecoder().decode(fileData)) as CacheEntry<T>;

      // Check if expired
      const now = new Date();
      const expiresAt = new Date(cacheEntry.expiresAt);
      
      if (now > expiresAt) {
        await remove(fullPath);
        return {
          success: false,
          error: 'Cache entry expired',
        };
      }

      return { success: true, data: cacheEntry.data };
    } catch (error) {
      console.error('[CacheService] Failed to get cache:', error);
      return {
        success: false,
        error: `Failed to get cache: ${error}`,
      };
    }
  }

  async has(key: string, category: 'audio' | 'api' = 'api'): Promise<boolean> {
    const result = await this.get(key, category);
    return result.success;
  }

  async delete(key: string, category: 'audio' | 'api' = 'api'): Promise<StorageResult> {
    try {
      const path = category === 'audio' 
        ? await pathsService.getAudioCachePath()
        : await pathsService.getApiCachePath();

      const filename = generateCacheFilename(key, '.json');
      const fullPath = `${path}${filename}`;

      if (await exists(fullPath)) {
        await remove(fullPath);
      }

      return { success: true };
    } catch (error) {
      console.error('[CacheService] Failed to delete cache:', error);
      return {
        success: false,
        error: `Failed to delete cache: ${error}`,
      };
    }
  }

  /** A copy of `bytes` as `name` for another app to open; returns its path. Copies go at the next launch. */
  async openCopy(name: string, bytes: Uint8Array): Promise<string> {
    const path = `${await pathsService.getOpenCachePath()}${Date.now()}-${name.replace(/[/\\]/g, '_')}`;
    await writeFile(path, bytes);
    return path;
  }

  async clearExpired(): Promise<StorageResult<number>> {
    let clearedCount = 0;

    try {
      // Clear expired audio cache
      const audioPath = await pathsService.getAudioCachePath();
      clearedCount += await this.clearExpiredInDirectory(audioPath);

      // Clear expired API cache
      const apiPath = await pathsService.getApiCachePath();
      clearedCount += await this.clearExpiredInDirectory(apiPath);

      // Copies handed to other apps last run are done with
      clearedCount += await this.clearDirectory(await pathsService.getOpenCachePath());

      console.log('[CacheService] Cleared expired cache entries:', clearedCount);
      return { success: true, data: clearedCount };
    } catch (error) {
      console.error('[CacheService] Failed to clear expired cache:', error);
      return {
        success: false,
        error: `Failed to clear expired cache: ${error}`,
      };
    }
  }

  async clearAll(): Promise<StorageResult<number>> {
    let clearedCount = 0;

    try {
      // Clear audio cache
      const audioPath = await pathsService.getAudioCachePath();
      clearedCount += await this.clearDirectory(audioPath);

      // Clear API cache
      const apiPath = await pathsService.getApiCachePath();
      clearedCount += await this.clearDirectory(apiPath);

      clearedCount += await this.clearDirectory(await pathsService.getOpenCachePath());

      console.log('[CacheService] Cleared all cache:', clearedCount);
      return { success: true, data: clearedCount };
    } catch (error) {
      console.error('[CacheService] Failed to clear all cache:', error);
      return {
        success: false,
        error: `Failed to clear all cache: ${error}`,
      };
    }
  }

  private async clearExpiredInDirectory(path: string): Promise<number> {
    let count = 0;
    const now = new Date();

    try {
      const entries = await readDir(path);
      
      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const fullPath = `${path}${entry.name}`;
        
        try {
          const fileData = await readFile(fullPath);
          const cacheEntry = JSON.parse(new TextDecoder().decode(fileData)) as CacheEntry;
          
          const expiresAt = new Date(cacheEntry.expiresAt);
          if (now > expiresAt) {
            await remove(fullPath);
            count++;
          }
        } catch {
          // Ignore parse errors, continue
        }
      }
    } catch (error) {
      console.warn('[CacheService] Failed to clear expired in directory:', path);
    }

    return count;
  }

  private async clearDirectory(path: string): Promise<number> {
    let count = 0;

    try {
      const entries = await readDir(path);
      
      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const fullPath = `${path}${entry.name}`;
        await remove(fullPath);
        count++;
      }
    } catch (error) {
      console.warn('[CacheService] Failed to clear directory:', path);
    }

    return count;
  }

  private async getDirectoryStats(path: string): Promise<{ size: number; count: number }> {
    let size = 0;
    let count = 0;

    try {
      const entries = await readDir(path);
      
      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const fullPath = `${path}${entry.name}`;
        
        try {
          const fileData = await readFile(fullPath);
          size += fileData.length;
          count++;
        } catch {
          // Ignore errors
        }
      }
    } catch (error) {
      console.warn('[CacheService] Failed to get directory stats:', path);
    }

    return { size, count };
  }

  /** Clears expired entries once the cache passes its cleanup threshold. */
  private async enforceStorageSize(category: 'audio' | 'api'): Promise<void> {
    const maxSizeMB = category === 'audio' 
      ? StorageConfig.cache.audio.maxSizeMB
      : StorageConfig.cache.api.maxSizeMB;

    // Skip if no limit
    if (maxSizeMB <= 0) return;

    const path = category === 'audio' 
      ? await pathsService.getAudioCachePath()
      : await pathsService.getApiCachePath();

    const stats = await this.getDirectoryStats(path);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const threshold = maxSizeBytes * (StorageConfig.cache.cleanupThresholdPercent / 100);

    if (stats.size > threshold) {
      console.log(`[CacheService] Cache size (${stats.size}) exceeds threshold (${threshold}), cleaning up...`);
      
      // Clear expired first
      await this.clearExpiredInDirectory(path);
      
      // TODO: LRU eviction when still over the limit; only expired entries are cleared today.
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
