/** Meeting CRUD via the unified store (kasset.db). */

import type { MeetingDetail, MeetingIndexEntry } from '@shared/types';
import { store } from '@services/db';
import { remove, exists } from '@tauri-apps/plugin-fs';

class MeetingService {
  /** List all meetings from the store (lightweight) */
  async listMeetings(): Promise<MeetingIndexEntry[]> {
    const result = await store.meetings.list(1000); // high limit for "list all"
    return result.items;
  }

  /** Lazy-load full meeting detail */
  async getMeetingDetail(id: string): Promise<MeetingDetail | null> {
    return store.meetings.get(id);
  }

  /** Delete a meeting — deletes DB rows (cascading) + recording .wav files from disk */
  async deleteMeeting(id: string): Promise<boolean> {
    try {
      const { recordingFilenames } = await store.meetings.delete(id);

      // Clean up recording .wav files from disk
      for (const filename of recordingFilenames) {
        try {
          const { appDataDir, join } = await import('@tauri-apps/api/path');
          const base = await appDataDir();
          const wavPath = await join(base, 'recordings', filename);
          if (await exists(wavPath)) await remove(wavPath);
        } catch {
          // File may already be gone — non-fatal
        }
      }

      // Chunks and vectors went with the meeting delete; only the knowledge graph needs an orphan-node prune.
      import('@extensions/rag/graph-client').then(({ graphDB }) => {
        graphDB.deleteMeeting(id).catch(err =>
          console.warn('[MeetingService] Graph cleanup failed for', id, err)
        );
      }).catch((error: unknown) =>
        console.warn('[MeetingService] Graph client unavailable, skipping cleanup for', id, error)
      );

      return true;
    } catch (error) {
      console.error('[MeetingService] Failed to delete meeting:', id, error);
      return false;
    }
  }
}

export const meetingService = new MeetingService();
