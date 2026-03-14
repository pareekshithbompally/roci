/**
 * LocalStorage Migration Service
 * Migrates data from localStorage to Tauri storage
 */

import { settingsService } from '../storage';
import type { AppSettings } from '../storage/types';

class LocalStorageMigrationService {
  private readonly MIGRATION_KEY = 'kasset_ai_migrated';

  /**
   * Check if migration has already been completed
   */
  hasMigrated(): boolean {
    try {
      return localStorage.getItem(this.MIGRATION_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Mark migration as completed
   */
  private markMigrated(): void {
    try {
      localStorage.setItem(this.MIGRATION_KEY, 'true');
    } catch (error) {
      console.error('[Migration] Failed to mark migration complete:', error);
    }
  }

  /**
   * Migrate all localStorage data to Tauri storage
   */
  async migrate(): Promise<{ success: boolean; error?: string }> {
    try {
      // Skip if already migrated
      if (this.hasMigrated()) {
        console.log('[Migration] Already migrated, skipping...');
        return { success: true };
      }

      console.log('[Migration] Starting localStorage migration...');

      // Migrate settings
      await this.migrateSettings();

      // Migrate history
      await this.migrateHistory();

      // Migrate API key if present
      await this.migrateApiKey();

      // Mark as completed
      this.markMigrated();

      console.log('[Migration] Migration completed successfully');
      return { success: true };
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
      return {
        success: false,
        error: `Migration failed: ${error}`,
      };
    }
  }

  /**
   * Migrate settings from localStorage
   */
  private async migrateSettings(): Promise<void> {
    try {
      // Check for existing settings in localStorage
      const keys = [
        'kasset_theme',
        'kasset_autoSave',
        'kasset_notifications',
        'kasset_recordingQuality',
        'kasset_aiModel',
        'kasset_autoTranscribe',
      ];

      const existingSettings: Partial<AppSettings> = {};
      let hasAnySettings = false;

      // Read from localStorage
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          hasAnySettings = true;
          const settingName = key.replace('kasset_', '');
          
          // Parse value
          try {
            existingSettings[settingName as keyof AppSettings] = JSON.parse(value);
          } catch {
            existingSettings[settingName as keyof AppSettings] = value as any;
          }
        }
      }

      if (hasAnySettings) {
        // Load current settings and merge
        const currentResult = await settingsService.load();
        const mergedSettings = {
          ...currentResult.data,
          ...existingSettings,
        } as AppSettings;

        await settingsService.save(mergedSettings);
        console.log('[Migration] Migrated settings');
      }
    } catch (error) {
      console.warn('[Migration] Failed to migrate settings:', error);
    }
  }

  /**
   * Migrate history from localStorage
   * Note: Legacy historyService removed — history now uses meetingIndexRepository.
   * No localStorage history data exists in pre-release builds, so this is a no-op.
   */
  private async migrateHistory(): Promise<void> {
    // No-op: legacy history migration removed
  }

  /**
   * Migrate API key
   */
  private async migrateApiKey(): Promise<void> {
    try {
      const apiKeyKey = 'kasset_gemini_api_key';
      const apiKey = localStorage.getItem(apiKeyKey);

      if (apiKey) {
        await settingsService.set('geminiApiKey', apiKey);
        console.log('[Migration] Migrated API key');
      }
    } catch (error) {
      console.warn('[Migration] Failed to migrate API key:', error);
    }
  }

  /**
   * Clear old localStorage data (optional cleanup)
   */
  async clearOldData(): Promise<void> {
    try {
      const keysToRemove = [
        'kasset_theme',
        'kasset_autoSave',
        'kasset_notifications',
        'kasset_recordingQuality',
        'kasset_aiModel',
        'kasset_autoTranscribe',
        'kasset_history',
        'kasset_gemini_api_key',
      ];

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      console.log('[Migration] Cleared old localStorage data');
    } catch (error) {
      console.warn('[Migration] Failed to clear old localStorage:', error);
    }
  }
}

// Export singleton instance
export const migrationService = new LocalStorageMigrationService();
