/**
 * Transcription Service
 * Post-transcription pipeline: saves transcript, summary, recording meta,
 * creates todos from AI action items, adds to meeting index.
 *
 * Index update is the commit point — if sub-document writes fail,
 * the meeting directory is cleaned up and the index is never updated.
 */

import type { MeetingIndexEntry, MeetingSummary, TranscriptData, RecordingMeta, TodoEntry, AppSettings, HistoryItem } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import { meetingIndexRepository } from './repositories/meeting-index.repository';
import { transcriptRepository } from './repositories/transcript.repository';
import { summaryRepository } from './repositories/summary.repository';
import { recordingMetaRepository } from './repositories/recording-meta.repository';
import { todosRepository } from './repositories/todos.repository';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { formatMeetingSummary } from './searchIndexing.service';

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
  /** Calendar metadata to persist in the meeting index. */
  calendarMeta?: {
    calendarEventId: string;
    scheduledTitle: string;
    participants: Array<{ name?: string; email?: string; status?: string }>;
    scheduledStart: string;
    scheduledEnd: string;
    meetingUrl?: string;
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
      dueDate: item.dueDate ? normalizeDueDate(item.dueDate) : undefined,
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
        // Preserve calendar metadata from existing entry or new transcription
        calendarEventId: result.calendarMeta?.calendarEventId ?? existing?.calendarEventId,
        scheduledTitle: result.calendarMeta?.scheduledTitle ?? existing?.scheduledTitle,
        participants: result.calendarMeta?.participants ?? existing?.participants,
        scheduledStart: result.calendarMeta?.scheduledStart ?? existing?.scheduledStart,
        scheduledEnd: result.calendarMeta?.scheduledEnd ?? existing?.scheduledEnd,
        meetingUrl: result.calendarMeta?.meetingUrl ?? existing?.meetingUrl,
      };

      if (existing) {
        await meetingIndexRepository.updateInIndex(meetingId, indexEntry);
      } else {
        await meetingIndexRepository.addToIndex(indexEntry);
      }

      console.log('[TranscriptionService] Saved transcription result for meeting:', meetingId);

      // Fire-and-forget: index meeting into vector DB for immediate Cmd+K searchability
      // Mirrors the pattern in chatService.persistSession() → chatIndexer.indexSession()
      const historyItem: HistoryItem = {
        id: meetingId,
        title,
        transcript,
        summary: formatMeetingSummary(summary),
        categories,
        timestamp: Date.parse(now),
        recordingFileName,
        inputSource,
      };
      import('../extensions/rag/indexer').then(({ ragIndexer }) => {
        ragIndexer.indexMeeting(historyItem, { includeEmbeddings: false }).catch(err =>
          console.error('[TranscriptionService] Meeting indexing failed (non-fatal):', meetingId, err)
        );
      }).catch(err => console.error('[TranscriptionService] Failed to load RAG indexer:', err));

      // Trigger entity extraction (non-blocking, non-fatal)
      if (result.extractionContext) {
        const ctx = result.extractionContext;
        import('../extensions/rag/entity-extractor').then(({ entityExtractor }) => {
          entityExtractor.extractAndUpsert(
            meetingId, title, summary, transcript,
            ctx.settings,
            ctx.providers,
            result.categories || [],
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
