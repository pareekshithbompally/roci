/**
 * Meeting Service
 * Orchestrates meeting CRUD. Lazy-loads sub-files in parallel.
 */

import type { MeetingDetail, MeetingIndexEntry } from '@shared/types';
import { meetingIndexRepository } from './repositories/meeting-index.repository';
import { transcriptRepository } from './repositories/transcript.repository';
import { summaryRepository } from './repositories/summary.repository';
import { notesRepository } from './repositories/notes.repository';
import { todosRepository } from './repositories/todos.repository';
import { recordingMetaRepository } from './repositories/recording-meta.repository';

class MeetingService {
  /** List all meetings from the index (lightweight) */
  async listMeetings(): Promise<MeetingIndexEntry[]> {
    return meetingIndexRepository.loadIndex();
  }

  /** Lazy-load full meeting detail — parallel reads */
  async getMeetingDetail(id: string): Promise<MeetingDetail | null> {
    const index = await meetingIndexRepository.getFromIndex(id);
    if (!index) return null;

    const [transcript, summary, recording, notes, todos] = await Promise.all([
      transcriptRepository.readDoc(id),
      summaryRepository.readDoc(id),
      recordingMetaRepository.readDoc(id),
      notesRepository.readDoc(id),
      todosRepository.readDoc(id),
    ]);

    return {
      index,
      transcript: transcript || undefined,
      summary: summary || undefined,
      recording: recording || undefined,
      notes: notes || [],
      todos: todos || [],
    };
  }

  /** Delete a meeting — removes index entry + all meeting sub-files */
  async deleteMeeting(id: string): Promise<boolean> {
    try {
      // Delete all sub-files in parallel (each returns true even if file doesn't exist)
      const [indexOk, ...fileResults] = await Promise.all([
        meetingIndexRepository.removeFromIndex(id),
        transcriptRepository.deleteDoc(id),
        summaryRepository.deleteDoc(id),
        notesRepository.deleteDoc(id),
        todosRepository.deleteDoc(id),
        recordingMetaRepository.deleteDoc(id),
      ]);

      // Try to remove the now-empty meeting directory
      // Use any document repo since they all share the same base path
      try {
        await transcriptRepository.deleteMeetingDir(id);
      } catch {
        // Directory may already be gone or non-existent — not an error
      }

      // Clean up vector + graph data (non-blocking, non-fatal)
      import('@extensions/rag/client').then(({ vectorDB }) => {
        vectorDB.deleteMeeting(id).catch(err =>
          console.warn('[MeetingService] Vector cleanup failed for', id, err)
        );
      }).catch(() => {});
      import('@extensions/rag/graph-client').then(({ graphDB }) => {
        graphDB.deleteMeeting(id).catch(err =>
          console.warn('[MeetingService] Graph cleanup failed for', id, err)
        );
      }).catch(() => {});

      if (!indexOk || fileResults.some(r => !r)) {
        console.warn('[MeetingService] Partial deletion for meeting:', id);
      }

      return indexOk;
    } catch (error) {
      console.error('[MeetingService] Failed to delete meeting:', id, error);
      return false;
    }
  }
}

export const meetingService = new MeetingService();
