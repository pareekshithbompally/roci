/**
 * Summaries Storage Service
 * Manages AI-generated summary persistence
 */

import { writeFile, readFile, remove, exists } from '@tauri-apps/plugin-fs';
import { StorageConfig, generateSummaryFilename } from '../../src/config/storage.config';
import { pathsService } from './paths.service';
import type { SummaryData, StorageResult } from './types';

class SummariesService {
  /**
   * Save summary data
   */
  async saveSummary(
    recordingId: string,
    transcriptionId: string,
    summary: string,
    keyPoints: string[],
    metadata: Partial<SummaryData> = {}
  ): Promise<StorageResult<SummaryData>> {
    try {
      console.log('[SummariesService] Saving summary for:', recordingId);
      const filename = generateSummaryFilename(recordingId);
      const path = await pathsService.getSummariesPath();
      const fullPath = `${path}${filename}`;
      console.log('[SummariesService] Full path:', fullPath);

      const summaryData: SummaryData = {
        id: metadata.id || crypto.randomUUID(),
        recordingId,
        transcriptionId,
        summary,
        categories: metadata.categories,
        keyPoints,
        actionItems: metadata.actionItems,
        model: metadata.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: StorageConfig.metadataVersion,
      };

      // Ensure directory exists before writing
      const dirPath = path.replace(/\/$/, ''); // Remove trailing slash
      const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
      const dirExists = await exists(dirPath);
      console.log('[SummariesService] Directory exists?', dirExists, 'at:', dirPath);
      
      if (!dirExists) {
        console.log('[SummariesService] Creating directory:', dirPath);
        await mkdir(dirPath, { recursive: true });
        console.log('[SummariesService] Created directory:', dirPath);
      }

      console.log('[SummariesService] Writing file...');
      await writeFile(
        fullPath,
        new TextEncoder().encode(JSON.stringify(summaryData, null, 2))
      );

      console.log('[SummariesService] ✓ Saved summary for:', recordingId);
      return { success: true, data: summaryData };
    } catch (error) {
      console.error('[SummariesService] ❌ Failed to save summary:', error);
      return {
        success: false,
        error: `Failed to save summary: ${error}`,
      };
    }
  }

  /**
   * Load summary by recording ID
   */
  async getSummary(recordingId: string): Promise<StorageResult<SummaryData>> {
    try {
      const filename = generateSummaryFilename(recordingId);
      const path = await pathsService.getSummariesPath();
      const fullPath = `${path}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return {
          success: false,
          error: 'Summary not found',
        };
      }

      const data = await readFile(fullPath);
      const summary = JSON.parse(new TextDecoder().decode(data)) as SummaryData;

      return { success: true, data: summary };
    } catch (error) {
      console.error('[SummariesService] Failed to load summary:', error);
      return {
        success: false,
        error: `Failed to load summary: ${error}`,
      };
    }
  }

  /**
   * List all summaries
   */
  async listSummaries(): Promise<StorageResult<SummaryData[]>> {
    try {
      const files = await pathsService.listFiles('summaries');
      const path = await pathsService.getSummariesPath();
      const summaries: SummaryData[] = [];

      for (const file of files) {
        const fullPath = `${path}${file}`;
        
        try {
          const data = await readFile(fullPath);
          const summary = JSON.parse(new TextDecoder().decode(data)) as SummaryData;
          summaries.push(summary);
        } catch (error) {
          console.warn('[SummariesService] Failed to parse summary file:', file);
        }
      }

      // Sort by creation date (newest first)
      summaries.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { success: true, data: summaries };
    } catch (error) {
      console.error('[SummariesService] Failed to list summaries:', error);
      return {
        success: false,
        error: `Failed to list summaries: ${error}`,
      };
    }
  }

  /**
   * Delete summary
   */
  async deleteSummary(recordingId: string): Promise<StorageResult> {
    try {
      const filename = generateSummaryFilename(recordingId);
      const path = await pathsService.getSummariesPath();
      const fullPath = `${path}${filename}`;

      if (await exists(fullPath)) {
        await remove(fullPath);
        console.log('[SummariesService] Deleted summary for:', recordingId);
      }

      return { success: true };
    } catch (error) {
      console.error('[SummariesService] Failed to delete summary:', error);
      return {
        success: false,
        error: `Failed to delete summary: ${error}`,
      };
    }
  }

  /**
   * Update summary
   */
  async updateSummary(
    recordingId: string,
    updates: Partial<SummaryData>
  ): Promise<StorageResult<SummaryData>> {
    try {
      const result = await this.getSummary(recordingId);
      if (!result.success || !result.data) {
        return result;
      }

      const updatedData: SummaryData = {
        ...result.data,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const filename = generateSummaryFilename(recordingId);
      const path = await pathsService.getSummariesPath();
      const fullPath = `${path}${filename}`;

      await writeFile(
        fullPath,
        new TextEncoder().encode(JSON.stringify(updatedData, null, 2))
      );

      return { success: true, data: updatedData };
    } catch (error) {
      console.error('[SummariesService] Failed to update summary:', error);
      return {
        success: false,
        error: `Failed to update summary: ${error}`,
      };
    }
  }
}

// Export singleton instance
export const summariesService = new SummariesService();
