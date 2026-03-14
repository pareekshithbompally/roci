/**
 * Transcriptions Storage Service
 * Manages transcription data persistence
 */

import { writeFile, readFile, remove, exists } from '@tauri-apps/plugin-fs';
import { StorageConfig, generateTranscriptionFilename } from '../../src/config/storage.config';
import { pathsService } from './paths.service';
import type { TranscriptionData, StorageResult } from './types';

class TranscriptionsService {
  /**
   * Save transcription data
   */
  async saveTranscription(
    recordingId: string,
    text: string,
    metadata: Partial<TranscriptionData> = {}
  ): Promise<StorageResult<TranscriptionData>> {
    try {
      console.log('[TranscriptionsService] Saving transcription for:', recordingId);
      const filename = generateTranscriptionFilename(recordingId);
      const path = await pathsService.getTranscriptionsPath();
      const fullPath = `${path}${filename}`;
      console.log('[TranscriptionsService] Full path:', fullPath);

      const transcriptionData: TranscriptionData = {
        id: metadata.id || crypto.randomUUID(),
        recordingId,
        text,
        language: metadata.language,
        confidence: metadata.confidence,
        processingTime: metadata.processingTime,
        model: metadata.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: StorageConfig.metadataVersion,
      };

      // Ensure directory exists before writing
      const dirPath = path.replace(/\/$/, ''); // Remove trailing slash
      const dirExists = await exists(dirPath);
      console.log('[TranscriptionsService] Directory exists?', dirExists, 'at:', dirPath);
      
      if (!dirExists) {
        console.log('[TranscriptionsService] Directory missing, importing mkdir...');
        const { mkdir } = await import('@tauri-apps/plugin-fs');
        await mkdir(dirPath, { recursive: true });
        console.log('[TranscriptionsService] Created directory:', dirPath);
      }

      console.log('[TranscriptionsService] Writing file...');
      await writeFile(
        fullPath,
        new TextEncoder().encode(JSON.stringify(transcriptionData, null, 2))
      );

      console.log('[TranscriptionsService] ✓ Saved transcription for:', recordingId);
      return { success: true, data: transcriptionData };
    } catch (error) {
      console.error('[TranscriptionsService] ❌ Failed to save transcription:', error);
      return {
        success: false,
        error: `Failed to save transcription: ${error}`,
      };
    }
  }

  /**
   * Load transcription by recording ID
   */
  async getTranscription(recordingId: string): Promise<StorageResult<TranscriptionData>> {
    try {
      const filename = generateTranscriptionFilename(recordingId);
      const path = await pathsService.getTranscriptionsPath();
      const fullPath = `${path}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return {
          success: false,
          error: 'Transcription not found',
        };
      }

      const data = await readFile(fullPath);
      const transcription = JSON.parse(new TextDecoder().decode(data)) as TranscriptionData;

      return { success: true, data: transcription };
    } catch (error) {
      console.error('[TranscriptionsService] Failed to load transcription:', error);
      return {
        success: false,
        error: `Failed to load transcription: ${error}`,
      };
    }
  }

  /**
   * List all transcriptions
   */
  async listTranscriptions(): Promise<StorageResult<TranscriptionData[]>> {
    try {
      const files = await pathsService.listFiles('transcriptions');
      const transcriptions: TranscriptionData[] = [];

      for (const file of files) {
        const path = await pathsService.getTranscriptionsPath();
        const fullPath = `${path}${file}`;
        
        try {
          const data = await readFile(fullPath);
          const transcription = JSON.parse(new TextDecoder().decode(data)) as TranscriptionData;
          transcriptions.push(transcription);
        } catch (error) {
          console.warn('[TranscriptionsService] Failed to parse transcription file:', file);
        }
      }

      // Sort by creation date (newest first)
      transcriptions.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { success: true, data: transcriptions };
    } catch (error) {
      console.error('[TranscriptionsService] Failed to list transcriptions:', error);
      return {
        success: false,
        error: `Failed to list transcriptions: ${error}`,
      };
    }
  }

  /**
   * Delete transcription
   */
  async deleteTranscription(recordingId: string): Promise<StorageResult> {
    try {
      const filename = generateTranscriptionFilename(recordingId);
      const path = await pathsService.getTranscriptionsPath();
      const fullPath = `${path}${filename}`;

      if (await exists(fullPath)) {
        await remove(fullPath);
        console.log('[TranscriptionsService] Deleted transcription for:', recordingId);
      }

      return { success: true };
    } catch (error) {
      console.error('[TranscriptionsService] Failed to delete transcription:', error);
      return {
        success: false,
        error: `Failed to delete transcription: ${error}`,
      };
    }
  }

  /**
   * Update transcription
   */
  async updateTranscription(
    recordingId: string,
    updates: Partial<TranscriptionData>
  ): Promise<StorageResult<TranscriptionData>> {
    try {
      const result = await this.getTranscription(recordingId);
      if (!result.success || !result.data) {
        return result;
      }

      const updatedData: TranscriptionData = {
        ...result.data,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const filename = generateTranscriptionFilename(recordingId);
      const path = await pathsService.getTranscriptionsPath();
      const fullPath = `${path}${filename}`;

      await writeFile(
        fullPath,
        new TextEncoder().encode(JSON.stringify(updatedData, null, 2))
      );

      return { success: true, data: updatedData };
    } catch (error) {
      console.error('[TranscriptionsService] Failed to update transcription:', error);
      return {
        success: false,
        error: `Failed to update transcription: ${error}`,
      };
    }
  }
}

// Export singleton instance
export const transcriptionsService = new TranscriptionsService();
