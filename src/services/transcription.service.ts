/**
 * Transcription Service
 * Post-transcription pipeline: saves transcript, summary, recording meta,
 * creates todos from AI action items — all atomically via store.meetings.saveTranscription().
 */

import type { MeetingIndexEntry, MeetingSummary, TranscriptData, RecordingMeta, TodoEntry, AppSettings, HistoryItem, StoredTranscriptSegment } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { store } from '@services/db';
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
  segments?: StoredTranscriptSegment[];
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
   * Saves all data atomically via the store plugin.
   */
  async saveTranscriptionResult(result: TranscriptionResult): Promise<boolean> {
    const { meetingId, title, transcript, summary, categories, recordingFileName, inputSource, model, language, segments } = result;

    try {
      // Build AI action items as todo inputs
      const actionItems = summary.actionItems.map((item) => ({
        text: item.text,
        owner: item.owner,
        dueDate: item.dueDate ? normalizeDueDate(item.dueDate) : undefined,
      }));

      // Save everything atomically in one transaction
      await store.meetings.saveTranscription({
        meetingId,
        title,
        transcript,
        transcriptLanguage: language,
        transcriptModel: model,
        transcriptSegments: segments && segments.length > 0
          ? JSON.stringify(segments)
          : undefined,
        summaryOverview: summary.overview || '',
        summaryData: JSON.stringify({
          keyDiscussionPoints: summary.keyDiscussionPoints ?? [],
          decisionsMade: summary.decisionsMade ?? [],
          actionItems: summary.actionItems ?? [],
          nextSteps: summary.nextSteps ?? [],
        }),
        categories: categories.length > 0 ? categories : undefined,
        recordingFilename: recordingFileName,
        recordingInputSource: inputSource,
        inputSource,
        calendarMeta: result.calendarMeta,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
        createdAt: new Date().getTime(),
      });

      console.log('[TranscriptionService] Saved transcription result for meeting:', meetingId);

      // Fire-and-forget: index meeting into vector DB
      const now = new Date().toISOString();
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
      import('@extensions/rag/indexer').then(({ ragIndexer }) => {
        ragIndexer.indexMeeting(historyItem, { includeEmbeddings: false }).catch(err =>
          console.error('[TranscriptionService] Meeting indexing failed (non-fatal):', meetingId, err)
        );
      }).catch(err => console.error('[TranscriptionService] Failed to load RAG indexer:', err));

      // Trigger entity extraction (non-blocking, non-fatal)
      if (result.extractionContext) {
        const ctx = result.extractionContext;
        import('@extensions/rag/entity-extractor').then(({ entityExtractor }) => {
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
      console.error('[TranscriptionService] Failed to save transcription:', meetingId, error);
      return false;
    }
  }
}

export const transcriptionService = new TranscriptionService();
