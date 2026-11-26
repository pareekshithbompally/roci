/** Recording audio files on disk (`assets/{meeting id}.{ext}`, the one folder of kept files); their rows live in roci.db
 *  with the meeting. */

import { writeFile, readFile, exists, stat } from '@tauri-apps/plugin-fs';
import { sep } from '@tauri-apps/api/path';
import { assetsService } from './assets.service';
import type { StorageResult } from './types';

/** The assets folder with its trailing separator, for joining a recording's file name. */
async function getRecordingsPath(): Promise<string> {
  const dir = await assetsService.folder();
  const separator = sep();
  return dir.endsWith(separator) ? dir : `${dir}${separator}`;
}

export const recordingsService = {
  async getRecordingData(filename: string): Promise<StorageResult<Uint8Array>> {
    try {
      const fullPath = `${await getRecordingsPath()}${filename}`;
      if (!(await exists(fullPath))) return { success: false, error: 'Recording file not found' };
      return { success: true, data: await readFile(fullPath) };
    } catch (error: unknown) {
      console.error('[RecordingsService] Failed to load recording:', error);
      return { success: false, error: `Failed to load recording: ${error}` };
    }
  },

  /** Where a recording lives on disk, and its size; null when the file is gone. */
  async recordingFile(filename: string): Promise<{ path: string; sizeBytes: number } | null> {
    const path = `${await getRecordingsPath()}${filename}`;
    if (!(await exists(path))) return null;
    return { path, sizeBytes: (await stat(path)).size };
  },

  /** Writes an imported recording into the assets folder; throws when it can't. */
  async writeRecording(filename: string, data: Uint8Array): Promise<void> {
    await writeFile(`${await getRecordingsPath()}${filename}`, data);
  },
};
