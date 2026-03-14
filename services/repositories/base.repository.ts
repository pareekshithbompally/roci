/**
 * BaseRepository — generic JSON file operations via @tauri-apps/plugin-fs.
 * Single error handling pattern for all repositories.
 */

import { readTextFile, writeTextFile, remove, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export class BaseRepository {
  async readJson<T>(path: string): Promise<T | null> {
    try {
      const fileExists = await exists(path);
      if (!fileExists) return null;
      const text = await readTextFile(path);
      return JSON.parse(text) as T;
    } catch (error) {
      console.error(`[BaseRepository] readJson failed: ${path}`, error);
      return null;
    }
  }

  async writeJson<T>(path: string, data: T): Promise<boolean> {
    try {
      await writeTextFile(path, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`[BaseRepository] writeJson failed: ${path}`, error);
      return false;
    }
  }

  async deleteFile(path: string): Promise<boolean> {
    try {
      const fileExists = await exists(path);
      if (!fileExists) return true;
      await remove(path);
      return true;
    } catch (error) {
      console.error(`[BaseRepository] deleteFile failed: ${path}`, error);
      return false;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      return await exists(path);
    } catch {
      return false;
    }
  }

  async ensureDir(path: string): Promise<void> {
    try {
      const dirExists = await exists(path);
      if (!dirExists) {
        await mkdir(path, { recursive: true });
      }
    } catch (error) {
      console.error(`[BaseRepository] ensureDir failed: ${path}`, error);
    }
  }

  /** Join path segments using Tauri's path API */
  protected async joinPath(...segments: string[]): Promise<string> {
    return join(...segments);
  }
}
