/** Recording WAV files on disk; their metadata rows live in kasset.db. */

import { writeFile, readFile, remove, exists, stat } from '@tauri-apps/plugin-fs';
import { appDataDir, join, sep } from '@tauri-apps/api/path';
import { store } from '@services/db';
import type { RecordingMetadata, StorageResult, FileOperationOptions } from './types';

let recordingsDirPromise: Promise<string> | null = null;

async function getRecordingsPath(): Promise<string> {
  if (!recordingsDirPromise) {
    recordingsDirPromise = (async () => {
      const base = await appDataDir();
      const dir = await join(base, 'recordings');
      if (!(await exists(dir))) {
        const { mkdir } = await import('@tauri-apps/plugin-fs');
        await mkdir(dir, { recursive: true });
      }
      const separator = sep();
      return dir.endsWith(separator) ? dir : `${dir}${separator}`;
    })();
  }
  return recordingsDirPromise;
}

class RecordingsService {
  /** Writes the WAV to disk and upserts its row in kasset.db. */
  async saveRecording(
    audioData: Uint8Array,
    metadata: Partial<RecordingMetadata>,
    options: FileOperationOptions = {},
  ): Promise<StorageResult<RecordingMetadata>> {
    try {
      const filename = (metadata.filename || `rec_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.wav`).replace(/^.*[\\/]/, '');
      const dir = await getRecordingsPath();
      const fullPath = `${dir}${filename}`;

      if (!options.overwrite && await exists(fullPath)) {
        return { success: false, error: 'Recording file already exists' };
      }

      const recordId = metadata.id || crypto.randomUUID();
      const recordingMetadata: RecordingMetadata = {
        id: recordId,
        filename,
        duration: metadata.duration || 0,
        format: 'wav',
        size: audioData.length,
        deviceLabel: metadata.deviceLabel,
        createdAt: metadata.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Write audio file
      await writeFile(fullPath, audioData);

      // Upsert recording row in kasset.db (meeting_id stays NULL until transcription links it)
      await store.recordings.upsert({
        id: recordId,
        filename,
        durationSeconds: recordingMetadata.duration || undefined,
        inputSource: metadata.inputSource,
        createdAt: new Date(recordingMetadata.createdAt).getTime(),
      });

      console.log('[RecordingsService] Saved recording:', filename);
      return { success: true, data: recordingMetadata };
    } catch (error) {
      console.error('[RecordingsService] Failed to save recording:', error);
      return { success: false, error: `Failed to save recording: ${error}` };
    }
  }

  /** Adds a kasset.db row for a WAV already on disk from native capture. */
  async registerRecording(
    filename: string,
    metadata: Partial<RecordingMetadata> = {},
  ): Promise<StorageResult<RecordingMetadata>> {
    try {
      const dir = await getRecordingsPath();
      const fullPath = `${dir}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return { success: false, error: 'Recording file not found' };
      }

      const fileInfo = await stat(fullPath);

      const recordId = metadata.id || crypto.randomUUID();
      const recordingMetadata: RecordingMetadata = {
        id: recordId,
        filename,
        duration: metadata.duration || 0,
        format: 'wav',
        size: metadata.size || fileInfo.size || 0,
        deviceLabel: metadata.deviceLabel,
        inputSource: metadata.inputSource,
        createdAt: metadata.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Upsert recording row in kasset.db (meeting_id stays NULL until transcription)
      await store.recordings.upsert({
        id: recordId,
        filename,
        durationSeconds: recordingMetadata.duration || undefined,
        inputSource: metadata.inputSource,
        createdAt: new Date(recordingMetadata.createdAt).getTime(),
      });

      console.log('[RecordingsService] Registered recording:', filename);
      return { success: true, data: recordingMetadata };
    } catch (error) {
      console.error('[RecordingsService] Failed to register recording:', error);
      return { success: false, error: `Failed to register recording: ${error}` };
    }
  }

  /** Recording metadata built from the WAV file on disk. */
  async getRecordingMetadata(filename: string): Promise<StorageResult<RecordingMetadata>> {
    try {
      const dir = await getRecordingsPath();
      const fullPath = `${dir}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return { success: false, error: 'Recording file not found' };
      }

      const fileInfo = await stat(fullPath);

      return {
        success: true,
        data: {
          id: filename,
          filename,
          duration: 0, // Duration is stored in the DB but we don't have a direct filename lookup
          format: 'wav',
          size: fileInfo.size || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      };
    } catch (error) {
      console.error('[RecordingsService] Failed to load metadata:', error);
      return { success: false, error: `Failed to load recording metadata: ${error}` };
    }
  }

  async getRecordingData(filename: string): Promise<StorageResult<Uint8Array>> {
    try {
      const dir = await getRecordingsPath();
      const fullPath = `${dir}${filename}`;

      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return { success: false, error: 'Recording file not found' };
      }

      const data = await readFile(fullPath);
      return { success: true, data };
    } catch (error) {
      console.error('[RecordingsService] Failed to load recording:', error);
      return { success: false, error: `Failed to load recording: ${error}` };
    }
  }

  /** Every recording, by scanning the files on disk. */
  async listRecordings(): Promise<StorageResult<RecordingMetadata[]>> {
    try {
      const dir = await getRecordingsPath();
      const { readDir } = await import('@tauri-apps/plugin-fs');

      const entries = await readDir(dir);
      const wavFiles = entries
        .filter(e => !e.isDirectory && (e.name.endsWith('.wav') || e.name.endsWith('.webm')))
        .filter(e => !e.name.endsWith('.meta.json'));

      const recordings: RecordingMetadata[] = wavFiles.map((entry) => ({
        id: entry.name,
        filename: entry.name,
        duration: 0,
        format: entry.name.endsWith('.webm') ? 'webm' : 'wav',
        size: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      }));

      return { success: true, data: recordings };
    } catch (error) {
      console.error('[RecordingsService] Failed to list recordings:', error);
      return { success: false, error: `Failed to list recordings: ${error}` };
    }
  }

  /** Removes the WAV; its DB row cascades from the meeting delete. */
  async deleteRecording(filename: string): Promise<StorageResult> {
    try {
      const dir = await getRecordingsPath();
      const audioPath = `${dir}${filename}`;

      if (await exists(audioPath)) {
        await remove(audioPath);
      }

      // Delete recording row from kasset.db
      try {
        await store.recordings.delete(filename);
      } catch {
        // DB row may already be deleted via meeting cascade
      }

      console.log('[RecordingsService] Deleted recording:', filename);
      return { success: true };
    } catch (error) {
      console.error('[RecordingsService] Failed to delete recording:', error);
      return { success: false, error: `Failed to delete recording: ${error}` };
    }
  }

  async updateRecordingMetadata(
    filename: string,
    updates: Partial<RecordingMetadata>,
  ): Promise<StorageResult<RecordingMetadata>> {
    try {
      await store.recordings.upsert({
        id: updates.id || filename,
        filename,
        durationSeconds: updates.duration || undefined,
        inputSource: updates.inputSource,
        createdAt: updates.createdAt ? new Date(updates.createdAt).getTime() : undefined,
      });

      return {
        success: true,
        data: {
          id: updates.id || filename,
          filename,
          duration: updates.duration || 0,
          format: 'wav',
          size: 0,
          createdAt: updates.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      };
    } catch (error) {
      console.error('[RecordingsService] Failed to update metadata:', error);
      return { success: false, error: `Failed to update recording metadata: ${error}` };
    }
  }

  async getRecordingPath(filename: string): Promise<string> {
    const dir = await getRecordingsPath();
    return `${dir}${filename}`;
  }
}

// Export singleton instance
export const recordingsService = new RecordingsService();
