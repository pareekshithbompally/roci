/**
 * History Storage Service
 * Manages application history and recent items
 */

import { writeFile, readFile, exists } from '@tauri-apps/plugin-fs';
import { StorageConfig } from '../../src/config/storage.config';
import { pathsService } from './paths.service';
import type { HistoryEntry, StorageResult } from './types';

class HistoryService {
  private cachedHistory: HistoryEntry[] | null = null;

  /**
   * Load history from file
   */
  async load(): Promise<StorageResult<HistoryEntry[]>> {
    if (this.cachedHistory) {
      return { success: true, data: this.cachedHistory };
    }

    try {
      const path = await pathsService.getHistoryPath();
      const fileExists = await exists(path);

      if (!fileExists) {
        this.cachedHistory = [];
        return { success: true, data: [] };
      }

      const data = await readFile(path);
      const history = JSON.parse(new TextDecoder().decode(data)) as HistoryEntry[];
      
      this.cachedHistory = history;
      return { success: true, data: history };
    } catch (error) {
      console.error('[HistoryService] Failed to load history:', error);
      this.cachedHistory = [];
      return {
        success: true,
        data: [],
      };
    }
  }

  /**
   * Save history to file
   */
  async save(history: HistoryEntry[]): Promise<StorageResult> {
    try {
      const path = await pathsService.getHistoryPath();
      
      // Limit history size
      const limitedHistory = history.slice(0, StorageConfig.maxHistoryEntries);
      
      await writeFile(
        path,
        new TextEncoder().encode(JSON.stringify(limitedHistory, null, 2))
      );

      this.cachedHistory = limitedHistory;
      console.log('[HistoryService] Saved history:', limitedHistory.length, 'entries');
      
      return { success: true };
    } catch (error) {
      console.error('[HistoryService] Failed to save history:', error);
      return {
        success: false,
        error: `Failed to save history: ${error}`,
      };
    }
  }

  /**
   * Add entry to history
   */
  async add(entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<StorageResult> {
    try {
      const result = await this.load();
      const history = result.data || [];

      const newEntry: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: StorageConfig.metadataVersion,
      };

      // Add to beginning (most recent first)
      const updatedHistory = [newEntry, ...history];
      
      return await this.save(updatedHistory);
    } catch (error) {
      console.error('[HistoryService] Failed to add history entry:', error);
      return {
        success: false,
        error: `Failed to add history entry: ${error}`,
      };
    }
  }

  /**
   * Get history entries filtered by type
   */
  async getByType(type: HistoryEntry['type']): Promise<StorageResult<HistoryEntry[]>> {
    try {
      const result = await this.load();
      if (!result.success || !result.data) {
        return result;
      }

      const filtered = result.data.filter(entry => entry.type === type);
      return { success: true, data: filtered };
    } catch (error) {
      console.error('[HistoryService] Failed to filter history:', error);
      return {
        success: false,
        error: `Failed to filter history: ${error}`,
      };
    }
  }

  /**
   * Get recent history entries (last N)
   */
  async getRecent(limit: number = 10): Promise<StorageResult<HistoryEntry[]>> {
    try {
      const result = await this.load();
      if (!result.success || !result.data) {
        return result;
      }

      const recent = result.data.slice(0, limit);
      return { success: true, data: recent };
    } catch (error) {
      console.error('[HistoryService] Failed to get recent history:', error);
      return {
        success: false,
        error: `Failed to get recent history: ${error}`,
      };
    }
  }

  /**
   * Remove entry from history
   */
  async remove(entryId: string): Promise<StorageResult<void>> {
    try {
      const result = await this.load();
      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }

      const updated = result.data.filter(entry => entry.id !== entryId);
      const saveResult = await this.save(updated);
      
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      
      return { success: true, data: undefined };
    } catch (error) {
      console.error('[HistoryService] Failed to remove history entry:', error);
      return {
        success: false,
        error: `Failed to remove history entry: ${error}`,
      };
    }
  }

  /**
   * Clear all history
   */
  async clear(): Promise<StorageResult> {
    try {
      return await this.save([]);
    } catch (error) {
      console.error('[HistoryService] Failed to clear history:', error);
      return {
        success: false,
        error: `Failed to clear history: ${error}`,
      };
    }
  }

  /**
   * Clear cached history (force reload on next access)
   */
  clearCache(): void {
    this.cachedHistory = null;
  }
}

// Export singleton instance
export const historyService = new HistoryService();
