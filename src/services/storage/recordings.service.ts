/** Recording audio files on disk (`recordings/{meeting id}.{ext}`); their rows live in roci.db with the meeting. */

import { writeFile, readFile, exists, mkdir, stat } from '@tauri-apps/plugin-fs';
import { appDataDir, join, sep } from '@tauri-apps/api/path';
import type { StorageResult } from './types';

let recordingsDirPromise: Promise<string> | null = null;

async function getRecordingsPath(): Promise<string> {
  recordingsDirPromise ??= (async () => {
    const dir = await join(await appDataDir(), 'recordings');
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    const separator = sep();
    return dir.endsWith(separator) ? dir : `${dir}${separator}`;
  })();
  return recordingsDirPromise;
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

  /** Writes an imported recording into the recordings folder; throws when it can't. */
  async writeRecording(filename: string, data: Uint8Array): Promise<void> {
    await writeFile(`${await getRecordingsPath()}${filename}`, data);
  },
};
