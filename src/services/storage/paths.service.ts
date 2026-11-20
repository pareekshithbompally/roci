/** The app-data root and the cache folders; data lives in roci.db, kept files go through assetsService. */

import { appDataDir, join, sep } from '@tauri-apps/api/path';
import { exists, mkdir } from '@tauri-apps/plugin-fs';
import { StorageConfig } from '@config/storage.config';
import type { StorageResult } from './types';

class PathsService {
  private initialized = false;
  private basePath: string | null = null;
  private directoryPaths: Map<string, string> = new Map();

  /** Creates the cache directories. */
  async initialize(): Promise<StorageResult<string>> {
    if (this.initialized && this.basePath) {
      console.log('[PathsService] Already initialized at:', this.basePath);
      return { success: true, data: this.basePath };
    }

    try {
      const appDataPath = await appDataDir();
      console.log('[PathsService] App data dir:', appDataPath);
      this.basePath = appDataPath;

      // Create only binary-data directories (recordings + cache)
      console.log('[PathsService] Creating directory structure...');
      await this.createDirectoryStructure();
      console.log('[PathsService] Directory structure created successfully');

      this.initialized = true;
      console.log('[PathsService] Initialized storage at:', this.basePath);

      return { success: true, data: this.basePath };
    } catch (error) {
      console.error('[PathsService] Initialization failed:', error);
      return { success: false, error: `Failed to initialize storage: ${error}` };
    }
  }

  private async createDirectoryStructure(): Promise<void> {
    if (!this.basePath) {
      throw new Error('Base path not set');
    }

    const directories = [
      StorageConfig.directories.cache,
      StorageConfig.directories.cacheAudio,
      StorageConfig.directories.cacheApi,
    ];
    console.log('[PathsService] Creating', directories.length, 'directories:', directories);

    for (const dir of directories) {
      const fullPath = await join(this.basePath, dir);
      console.log('[PathsService] Creating directory:', fullPath);
      await this.ensureDirectory(fullPath);
      this.directoryPaths.set(dir, fullPath);
    }
  }

  private ensureTrailingSeparator(path: string): string {
    const separator = sep();
    return path.endsWith(separator) ? path : `${path}${separator}`;
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      const dirExists = await exists(path);
      if (!dirExists) {
        await mkdir(path, { recursive: true });
        console.log('[PathsService] ✓ Created directory:', path);
      } else {
        console.log('[PathsService] ✓ Directory already exists:', path);
      }
    } catch (error) {
      console.error('[PathsService] ❌ Failed to create directory:', path, error);
      throw error;
    }
  }

  async getBasePath(): Promise<string> {
    if (!this.basePath) {
      const result = await this.initialize();
      if (!result.success || !result.data) {
        throw new Error('Failed to get base path');
      }
      return result.data;
    }
    return this.basePath;
  }

  async getAudioCachePath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.cacheAudio);
    return this.ensureTrailingSeparator(fullPath);
  }

  async getApiCachePath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.cacheApi);
    return this.ensureTrailingSeparator(fullPath);
  }

  /** Resets service state for tests. */
  reset(): void {
    this.initialized = false;
    this.basePath = null;
    this.directoryPaths.clear();
  }
}

// Export singleton instance
export const pathsService = new PathsService();
