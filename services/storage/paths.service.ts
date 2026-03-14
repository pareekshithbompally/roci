/**
 * Path Resolution Service
 * Handles all path resolution and directory initialization
 */

import { appDataDir, join, sep } from '@tauri-apps/api/path';
import { exists, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { StorageConfig } from '../../src/config/storage.config';
import type { DirectoryInfo, StorageResult } from './types';

class PathsService {
  private initialized = false;
  private basePath: string | null = null;
  private directoryPaths: Map<string, string> = new Map();

  /**
   * Initialize the storage directory structure
   */
  async initialize(): Promise<StorageResult<string>> {
    if (this.initialized && this.basePath) {
      console.log('[PathsService] Already initialized at:', this.basePath);
      return { success: true, data: this.basePath };
    }

    try {
      // Get the app data directory path
      const appDataPath = await appDataDir();
      console.log('[PathsService] App data dir:', appDataPath);
      this.basePath = appDataPath;

      // Create all subdirectories
      console.log('[PathsService] Creating directory structure...');
      await this.createDirectoryStructure();
      console.log('[PathsService] Directory structure created successfully');

      this.initialized = true;
      console.log('[PathsService] Initialized storage at:', this.basePath);
      
      return { success: true, data: this.basePath };
    } catch (error) {
      console.error('[PathsService] Initialization failed:', error);
      return { 
        success: false, 
        error: `Failed to initialize storage: ${error}` 
      };
    }
  }

  /**
   * Create all required subdirectories
   */
  private async createDirectoryStructure(): Promise<void> {
    if (!this.basePath) {
      throw new Error('Base path not set');
    }

    const directories = Object.values(StorageConfig.directories);
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

  /**
   * Ensure a directory exists, create if it doesn't
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      console.log('[PathsService] Checking directory:', path);
      const dirExists = await exists(path);
      console.log('[PathsService] Directory exists?', dirExists);
      if (!dirExists) {
        console.log('[PathsService] Creating directory:', path);
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

  /**
   * Get the base app data directory path
   */
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

  /**
   * Get path for recordings directory
   */
  async getRecordingsPath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.recordings);
    return this.ensureTrailingSeparator(fullPath);
  }

  /**
   * Get path for cache directory
   */
  async getCachePath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.cache);
    return this.ensureTrailingSeparator(fullPath);
  }

  /**
   * Get path for audio cache directory
   */
  async getAudioCachePath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.cacheAudio);
    return this.ensureTrailingSeparator(fullPath);
  }

  /**
   * Get path for API cache directory
   */
  async getApiCachePath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.cacheApi);
    return this.ensureTrailingSeparator(fullPath);
  }

  /**
   * Get path for meetings directory
   */
  async getMeetingsPath(): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.meetings);
    return this.ensureTrailingSeparator(fullPath);
  }

  /**
   * Get path for a specific meeting directory
   */
  async getMeetingPath(meetingId: string): Promise<string> {
    const base = await this.getBasePath();
    const fullPath = await join(base, StorageConfig.directories.meetings, meetingId);
    return this.ensureTrailingSeparator(fullPath);
  }

  /**
   * Get path for settings file
   */
  async getSettingsPath(): Promise<string> {
    const base = await this.getBasePath();
    return await join(base, StorageConfig.fileNames.settings);
  }

  /**
   * Get full path for a file in a subdirectory
   */
  async getFullPath(subdirectory: keyof typeof StorageConfig.directories, filename: string): Promise<string> {
    const base = await this.getBasePath();
    const subdir = StorageConfig.directories[subdirectory];
    return await join(base, subdir, filename);
  }

  /**
   * Get directory info (size, file count)
   */
  async getDirectoryInfo(path: string): Promise<DirectoryInfo> {
    try {
      const dirExists = await exists(path);
      if (!dirExists) {
        return {
          path,
          exists: false,
          size: 0,
          fileCount: 0,
        };
      }

      const entries = await readDir(path);
      let totalSize = 0;
      let fileCount = 0;

      // Note: readDir doesn't provide file sizes directly
      // This is a simplified count
      for (const entry of entries) {
        if (!entry.isDirectory) {
          fileCount++;
        }
      }

      return {
        path,
        exists: true,
        size: totalSize,
        fileCount,
      };
    } catch (error) {
      console.error('[PathsService] Failed to get directory info:', error);
      return {
        path,
        exists: false,
        size: 0,
        fileCount: 0,
      };
    }
  }

  /**
   * List all files in a directory
   */
  async listFiles(directoryKey: keyof typeof StorageConfig.directories): Promise<string[]> {
    try {
      const base = await this.getBasePath();
      const subdir = StorageConfig.directories[directoryKey];
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

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.initialized = false;
    this.basePath = null;
    this.directoryPaths.clear();
  }
}

// Export singleton instance
export const pathsService = new PathsService();
