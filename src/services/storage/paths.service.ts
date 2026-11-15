/** Paths for recordings and caches; meetings, chats and settings live in kasset.db. */

import { appDataDir, join, sep } from '@tauri-apps/api/path';
import { exists, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { StorageConfig } from '@config/storage.config';
import type { DirectoryInfo, StorageResult } from './types';

class PathsService {
  private initialized = false;
  private basePath: string | null = null;
  private directoryPaths: Map<string, string> = new Map();

  /** Creates the recordings and cache directories only. */
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
      StorageConfig.directories.recordings,
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

  async getRecordingsPath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.recordings);
    return this.ensureTrailingSeparator(fullPath);
  }

  async getCachePath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.cache);
    return this.ensureTrailingSeparator(fullPath);
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

  async getFullPath(subdirectory: 'recordings' | 'cache' | 'cacheAudio' | 'cacheApi' | 'cache/audio' | 'cache/api', filename: string): Promise<string> {
    const base = await this.getBasePath();
    const subdir = subdirectory;
    return await join(base, subdir, filename);
  }

  /** Size and file count of a directory. */
  async getDirectoryInfo(path: string): Promise<DirectoryInfo> {
    try {
      const dirExists = await exists(path);
      if (!dirExists) {
        return { path, exists: false, size: 0, fileCount: 0 };
      }

      const entries = await readDir(path);
      let totalSize = 0;
      let fileCount = 0;

      for (const entry of entries) {
        if (!entry.isDirectory) {
          fileCount++;
        }
      }

      return { path, exists: true, size: totalSize, fileCount };
    } catch (error) {
      console.error('[PathsService] Failed to get directory info:', error);
      return { path, exists: false, size: 0, fileCount: 0 };
    }
  }

  async listFiles(directoryKey: 'recordings' | 'cache' | 'cacheAudio' | 'cacheApi' | 'cache/audio' | 'cache/api'): Promise<string[]> {
    try {
      const base = await this.getBasePath();
      const subdir = directoryKey;
      const fullPath = await join(base, subdir);

      const dirExists = await exists(fullPath);
      if (!dirExists) {
        return [];
      }

      const entries = await readDir(fullPath);
      return entries
        .filter(entry => !entry.isDirectory)
        .map(entry => entry.name);
    } catch (error) {
      console.error('[PathsService] Failed to list files:', error);
      return [];
    }
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
