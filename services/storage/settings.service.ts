/**
 * Settings Storage Service
 * Manages application settings persistence
 */

import { writeFile, readFile, exists } from '@tauri-apps/plugin-fs';
import { StorageConfig } from '../../src/config/storage.config';
import { pathsService } from './paths.service';
import type { AppSettings, StorageResult } from './types';

class SettingsService {
  private cachedSettings: AppSettings | null = null;

  /**
   * Load settings from file
   */
  async load(): Promise<StorageResult<AppSettings>> {
    // Always reload from file to get fresh data
    try {
      const path = await pathsService.getSettingsPath();
      console.log('[SettingsService] Loading from path:', path);
      
      const fileExists = await exists(path);
      console.log('[SettingsService] File exists:', fileExists);

      if (!fileExists) {
        console.log('[SettingsService] File not found, returning defaults');
        const defaults = StorageConfig.defaultSettings as AppSettings;
        return { success: true, data: defaults };
      }

      const data = await readFile(path);
      const settings = JSON.parse(new TextDecoder().decode(data)) as AppSettings;
      
      console.log('[SettingsService] Loaded raw settings, providers count:', 
        (settings as any).providers?.length || 0);
      console.log('[SettingsService] Has chatModel:', (settings as any).chatModel);
      
      // Merge with defaults to ensure all keys exist
      const merged = {
        ...StorageConfig.defaultSettings as AppSettings,
        ...settings,
      };

      this.cachedSettings = merged;
      console.log('[SettingsService] Loaded settings from file successfully');
      return { success: true, data: merged };
    } catch (error) {
      console.error('[SettingsService] Failed to load settings:', error);
      
      const defaults = StorageConfig.defaultSettings as AppSettings;
      return { success: true, data: defaults };
    }
  }

  /**
   * Save settings to file
   */
  async save(settings: AppSettings): Promise<StorageResult> {
    try {
      const path = await pathsService.getSettingsPath();
      
      await writeFile(
        path,
        new TextEncoder().encode(JSON.stringify(settings, null, 2))
      );

      this.cachedSettings = settings;
      console.log('[SettingsService] Saved settings to file');
      
      return { success: true };
    } catch (error) {
      console.error('[SettingsService] Failed to save settings:', error);
      return {
        success: false,
        error: `Failed to save settings: ${error}`,
      };
    }
  }

  /**
   * Get a specific setting value
   */
  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const result = await this.load();
    if (result.success && result.data) {
      return result.data[key];
    }
    return (StorageConfig.defaultSettings as AppSettings)[key];
  }

  /**
   * Set a specific setting value
   */
  async set<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<StorageResult> {
    try {
      const result = await this.load();
      const currentSettings = result.data || (StorageConfig.defaultSettings as AppSettings);
      
      const updatedSettings = {
        ...currentSettings,
        [key]: value,
      };

      return await this.save(updatedSettings);
    } catch (error) {
      console.error('[SettingsService] Failed to set setting:', error);
      return {
        success: false,
        error: `Failed to set setting: ${error}`,
      };
    }
  }

  /**
   * Reset settings to defaults
   */
  async reset(): Promise<StorageResult> {
    try {
      const defaults = StorageConfig.defaultSettings as AppSettings;
      return await this.save(defaults);
    } catch (error) {
      console.error('[SettingsService] Failed to reset settings:', error);
      return {
        success: false,
        error: `Failed to reset settings: ${error}`,
      };
    }
  }

  /**
   * Clear cached settings (force reload on next access)
   */
  clearCache(): void {
    this.cachedSettings = null;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
