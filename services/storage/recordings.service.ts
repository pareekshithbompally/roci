/**
 * Recordings Storage Service
 * Manages audio recording file operations
 */

import { writeFile, readFile, remove, exists, stat } from '@tauri-apps/plugin-fs';
import { StorageConfig, generateRecordingFilename } from '../../src/config/storage.config';
import { pathsService } from './paths.service';
import type { RecordingMetadata, StorageResult, FileOperationOptions } from './types';

class RecordingsService {
  /**
   * Save a recording with metadata
   */
  async saveRecording(
    audioData: Uint8Array,
    metadata: Partial<RecordingMetadata>,
    options: FileOperationOptions = {}
  ): Promise<StorageResult<RecordingMetadata>> {
    try {
      const filename = metadata.filename || generateRecordingFilename();
      const path = await pathsService.getRecordingsPath();
      const fullPath = `${path}${filename}`;

      // Check if file exists
      if (!options.overwrite && await exists(fullPath)) {
        return {
          success: false,
          error: 'Recording file already exists',
        };
      }

      // Create full metadata
      const recordingMetadata: RecordingMetadata = {
        id: crypto.randomUUID(),
        filename,
        duration: metadata.duration || 0,
        format: metadata.format || StorageConfig.formats.recording.defaultExtension.replace('.', ''),
        size: audioData.length,
        deviceLabel: metadata.deviceLabel,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: StorageConfig.metadataVersion,
      };

      // Write audio file
      await writeFile(fullPath, audioData);

      // Write metadata file
      const metadataPath = `${fullPath}.meta.json`;
      await writeFile(
        metadataPath,
        new TextEncoder().encode(JSON.stringify(recordingMetadata, null, 2))
      );

      console.log('[RecordingsService] Saved recording:', filename);
      return { success: true, data: recordingMetadata };
    } catch (error) {
      console.error('[RecordingsService] Failed to save recording:', error);
      return {
        success: false,
        error: `Failed to save recording: ${error}`,
      };
    }
  }

  /**
   * Register an existing recording file and create metadata
   */
  async registerRecording(
    filename: string,
    metadata: Partial<RecordingMetadata> = {}
  ): Promise<StorageResult<RecordingMetadata>> {
    try {
      const path = await pathsService.getRecordingsPath();
      const fullPath = `${path}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return { success: false, error: 'Recording file not found' };
      }

      const fileInfo = await stat(fullPath);
      const extensionIndex = filename.lastIndexOf('.');
      const extension = extensionIndex > -1 ? filename.slice(extensionIndex + 1) : '';

      const recordingMetadata: RecordingMetadata = {
        id: metadata.id || crypto.randomUUID(),
        filename,
        duration: metadata.duration || 0,
        format: metadata.format || extension || StorageConfig.formats.recording.defaultExtension.replace('.', ''),
        size: metadata.size || fileInfo.size || 0,
        deviceLabel: metadata.deviceLabel,
        inputSource: metadata.inputSource,
        transcriptionId: metadata.transcriptionId,
        summaryId: metadata.summaryId,
        createdAt: metadata.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: StorageConfig.metadataVersion,
      };

      const metadataPath = `${fullPath}.meta.json`;
      await writeFile(
        metadataPath,
        new TextEncoder().encode(JSON.stringify(recordingMetadata, null, 2))
      );

      console.log('[RecordingsService] Registered recording:', filename);
      return { success: true, data: recordingMetadata };
    } catch (error) {
      console.error('[RecordingsService] Failed to register recording:', error);
      return {
        success: false,
        error: `Failed to register recording: ${error}`,
      };
    }
  }

  /**
   * Load recording metadata
   */
  async getRecordingMetadata(filename: string): Promise<StorageResult<RecordingMetadata>> {
    try {
      const path = await pathsService.getRecordingsPath();
      const metadataPath = `${path}${filename}.meta.json`;

      const fileExists = await exists(metadataPath);
      if (!fileExists) {
        return {
          success: false,
          error: 'Recording metadata not found',
        };
      }

      const data = await readFile(metadataPath);
      const metadata = JSON.parse(new TextDecoder().decode(data)) as RecordingMetadata;

      return { success: true, data: metadata };
    } catch (error) {
      console.error('[RecordingsService] Failed to load metadata:', error);
      return {
        success: false,
        error: `Failed to load recording metadata: ${error}`,
      };
    }
  }

  /**
   * Load recording audio data
   */
  async getRecordingData(filename: string): Promise<StorageResult<Uint8Array>> {
    try {
      const path = await pathsService.getRecordingsPath();
      const fullPath = `${path}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return {
          success: false,
          error: 'Recording file not found',
        };
      }

      const data = await readFile(fullPath);
      return { success: true, data };
    } catch (error) {
      console.error('[RecordingsService] Failed to load recording:', error);
      return {
        success: false,
        error: `Failed to load recording: ${error}`,
      };
    }
  }

  /**
   * List all recordings
   */
  async listRecordings(): Promise<StorageResult<RecordingMetadata[]>> {
    try {
      const files = await pathsService.listFiles('recordings');
      const metadataFiles = files.filter(f => f.endsWith('.meta.json'));
      
      const recordings: RecordingMetadata[] = [];
      
      for (const metaFile of metadataFiles) {
        const filename = metaFile.replace('.meta.json', '');
        const result = await this.getRecordingMetadata(filename);
        if (result.success && result.data) {
          recordings.push(result.data);
        }
      }

      // Sort by creation date (newest first)
      recordings.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { success: true, data: recordings };
    } catch (error) {
      console.error('[RecordingsService] Failed to list recordings:', error);
      return {
        success: false,
        error: `Failed to list recordings: ${error}`,
      };
    }
  }

  /**
   * Delete a recording and its metadata
   */
  async deleteRecording(filename: string): Promise<StorageResult> {
    try {
      const path = await pathsService.getRecordingsPath();
      const audioPath = `${path}${filename}`;
      const metadataPath = `${audioPath}.meta.json`;

      // Delete audio file
      if (await exists(audioPath)) {
        await remove(audioPath);
      }

      // Delete metadata file
      if (await exists(metadataPath)) {
        await remove(metadataPath);
      }

      console.log('[RecordingsService] Deleted recording:', filename);
      return { success: true };
    } catch (error) {
      console.error('[RecordingsService] Failed to delete recording:', error);
      return {
        success: false,
        error: `Failed to delete recording: ${error}`,
      };
    }
  }

  /**
   * Update recording metadata
   */
  async updateRecordingMetadata(
    filename: string,
    updates: Partial<RecordingMetadata>
  ): Promise<StorageResult<RecordingMetadata>> {
    try {
      const result = await this.getRecordingMetadata(filename);
      if (!result.success || !result.data) {
        return result;
      }

      const updatedMetadata: RecordingMetadata = {
        ...result.data,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const path = await pathsService.getRecordingsPath();
      const metadataPath = `${path}${filename}.meta.json`;
      
      await writeFile(
        metadataPath,
        new TextEncoder().encode(JSON.stringify(updatedMetadata, null, 2))
      );

      return { success: true, data: updatedMetadata };
    } catch (error) {
      console.error('[RecordingsService] Failed to update metadata:', error);
      return {
        success: false,
        error: `Failed to update recording metadata: ${error}`,
      };
    }
  }

  /**
   * Get recording file path
   */
  async getRecordingPath(filename: string): Promise<string> {
    const path = await pathsService.getRecordingsPath();
    return `${path}${filename}`;
  }
}

// Export singleton instance
export const recordingsService = new RecordingsService();
