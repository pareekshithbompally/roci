/**
 * Recording Service
 * 
 * Business logic layer for recording operations.
 * Wraps coreAudioService with additional functionality like:
 * - Metadata management
 * - Error handling
 */

import { coreAudioService, type AudioCaptureResult } from '@services/coreAudio.service';
import { recordingsService } from '@services/storage';
import { isTauriEnvironment } from '@services/tauri';
import { StorageConfig, generateRecordingFilename, getRecordingIdFromFilename } from '@config/storage.config';
import type { AudioCaptureSource } from '@config/audio.config';
import type { RecordingMetadata } from '@features/recording/types';

export interface StartRecordingOptions {
  source: AudioCaptureSource;
  filename?: string;
}

export interface StartRecordingResult {
  recordingId: string;
  filename: string;
}

export interface StopRecordingResult {
  blob: Blob;
  path: string;
  duration: number;
}

class RecordingService {
  private currentRecordingId: string | null = null;
  private currentFilename: string | null = null;
  private startTime: number | null = null;

  /**
   * Check if native recording is available
   */
  isAvailable(): boolean {
    return isTauriEnvironment();
  }

  /**
   * Start a new recording
   */
  async startRecording(options: StartRecordingOptions): Promise<StartRecordingResult> {
    if (!this.isAvailable()) {
      throw new Error('Native recording is available in the desktop app only.');
    }

    const filename = options.filename || generateRecordingFilename();
    const recordingId = getRecordingIdFromFilename(filename);

    this.currentRecordingId = recordingId;
    this.currentFilename = filename;
    this.startTime = Date.now();

    await coreAudioService.startCapture({
      source: options.source,
      fileName: filename,
      recordingsDir: StorageConfig.directories.recordings,
    });

    return { recordingId, filename };
  }

  /**
   * Stop the current recording
   */
  async stopRecording(): Promise<StopRecordingResult | null> {
    const result = await coreAudioService.stopCapture();
    
    if (!result) {
      return null;
    }

    const duration = this.startTime 
      ? Math.floor((Date.now() - this.startTime) / 1000)
      : 0;

    const stopResult = {
      blob: result.blob,
      path: result.path,
      duration,
    };

    // Reset state
    this.currentRecordingId = null;
    this.currentFilename = null;
    this.startTime = null;

    return stopResult;
  }

  /**
   * Pause the current recording
   */
  async pauseRecording(): Promise<void> {
    await coreAudioService.pauseCapture();
  }

  /**
   * Resume the current recording
   */
  async resumeRecording(): Promise<void> {
    await coreAudioService.resumeCapture();
  }

  /**
   * Discard a recording (delete file if exists)
   */
  async discardRecording(filename?: string): Promise<void> {
    const fileToDelete = filename || this.currentFilename;
    
    if (fileToDelete && isTauriEnvironment()) {
      await recordingsService.deleteRecording(fileToDelete);
    }

    // Reset state
    this.currentRecordingId = null;
    this.currentFilename = null;
    this.startTime = null;
  }

  /**
   * Register recording metadata
   */
  async registerRecording(
    filename: string,
    metadata: Omit<RecordingMetadata, 'filename' | 'createdAt'>
  ): Promise<RecordingMetadata> {
    const fullMetadata: RecordingMetadata = {
      ...metadata,
      filename,
      createdAt: Date.now(),
    };

    await recordingsService.registerRecording(filename, {
      id: metadata.id,
      duration: metadata.duration,
      size: metadata.size,
      inputSource: metadata.inputSource,
    });

    return fullMetadata;
  }

  /**
   * Update recording metadata
   */
  async updateRecordingMetadata(
    filename: string,
    updates: Partial<RecordingMetadata>
  ): Promise<void> {
    await recordingsService.updateRecordingMetadata(filename, {
      transcriptionId: updates.transcriptionId,
      summaryId: updates.summaryId,
    });
  }

  /**
   * Get current recording info
   */
  getCurrentRecording(): { recordingId: string | null; filename: string | null } {
    return {
      recordingId: this.currentRecordingId,
      filename: this.currentFilename,
    };
  }
}

// Singleton instance
export const recordingService = new RecordingService();
export default recordingService;
