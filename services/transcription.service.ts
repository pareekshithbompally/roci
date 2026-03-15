/**
 * Transcription Service
 * Post-transcription pipeline: saves transcript, summary, recording meta,
 * creates todos from AI action items, adds to meeting index.
 *
 * Index update is the commit point — if sub-document writes fail,
 * the meeting directory is cleaned up and the index is never updated.
 */

import type { MeetingIndexEntry, MeetingSummary, TranscriptData, RecordingMeta, TodoEntry, AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import { meetingIndexRepository } from './repositories/meeting-index.repository';
import { transcriptRepository } from './repositories/transcript.repository';
import { summaryRepository } from './repositories/summary.repository';
import { recordingMetaRepository } from './repositories/recording-meta.repository';
import { todosRepository } from './repositories/todos.repository';

export interface TranscriptionResult {
  meetingId: string;
  title: string;
  transcript: string;
  summary: MeetingSummary;
  categories: string[];
  recordingFileName?: string;
  inputSource?: string;
  model?: string;
  language?: string;
  /** Optional: settings + providers for entity extraction. If omitted, extraction is skipped. */
  extractionContext?: {
    settings: AppSettings;
    providers: ModelProvider[];
  };
}

class TranscriptionService {
  /**
   * Single entry point after transcription completes.
   * Saves all data to the new per-meeting file structure and updates the index.
   * Uses Promise.allSettled for transactional safety — cleans up on partial failure.
   */
  async saveTranscriptionResult(result: TranscriptionResult): Promise<boolean> {
    const { meetingId, title, transcript, summary, categories, recordingFileName, inputSource, model, language } = result;
    const now = new Date().toISOString();

    // Build all data objects (no I/O)
    const transcriptData: TranscriptData = {
      text: transcript,
      language,
      model,
      createdAt: now,
    };

    const recordingMeta: RecordingMeta | undefined = recordingFileName
      ? { filename: recordingFileName, inputSource, createdAt: now }
      : undefined;

    const aiTodos: TodoEntry[] = summary.actionItems.map((item) => ({
      id: crypto.randomUUID(),
      text: item.text,
      owner: item.owner,
      dueDate: item.dueDate,
      completed: false,
      source: 'ai' as const,
      createdAt: now,
    }));

    // Write all sub-documents — use allSettled so one failure doesn't mask others
    const writeResults = await Promise.allSettled([
      transcriptRepository.writeDoc(meetingId, transcriptData),
      summaryRepository.writeDoc(meetingId, summary),
      ...(recordingMeta ? [recordingMetaRepository.writeDoc(meetingId, recordingMeta)] : []),
      ...(aiTodos.length > 0 ? [todosRepository.writeDoc(meetingId, aiTodos)] : []),
    ]);

    // Check for failures
    const failures = writeResults.filter(
      r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)
    );

    if (failures.length > 0) {
      console.error('[TranscriptionService] Partial write failure for meeting:', meetingId, failures);
      // Clean up incomplete meeting directory
      await transcriptRepository.deleteMeetingDir(meetingId);
      return false;
    }

    // All sub-documents written — now update the index (commit point)
    try {
      const existing = await meetingIndexRepository.getFromIndex(meetingId);
      const indexEntry: MeetingIndexEntry = {
        id: meetingId,
        title,
        categories,
        recordingFileName,
        inputSource,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      if (existing) {
        await meetingIndexRepository.updateInIndex(meetingId, indexEntry);
      } else {
        await meetingIndexRepository.addToIndex(indexEntry);
      }

      console.log('[TranscriptionService] Saved transcription result for meeting:', meetingId);

      // Trigger entity extraction (non-blocking, non-fatal)
      if (result.extractionContext) {
        const ctx = result.extractionContext;
        import('../extensions/rag/entity-extractor').then(({ entityExtractor }) => {
          entityExtractor.extractAndUpsert(
            meetingId, title, summary, transcript,
            ctx.settings,
            ctx.providers,
          ).catch(err => console.error('[TranscriptionService] Entity extraction failed:', err));
        }).catch(err => console.error('[TranscriptionService] Failed to load entity extractor:', err));
      }

      return true;
    } catch (error) {
      console.error('[TranscriptionService] Failed to update index for meeting:', meetingId, error);
      return false;
    }
  }
}

export const transcriptionService = new TranscriptionService();
