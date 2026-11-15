/** Saves a transcription's transcript, summary, recording meta and todos in one atomic store write. */

import type { MeetingSummary, AppSettings, HistoryItem, ProcessedResult, StoredTranscriptSegment } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { store } from '@services/db';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { formatMeetingSummary } from './searchIndexing.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersSync } from '@services/reminders';
import { appleNotesSync } from '@services/appleNotes';

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
  /** When the meeting happened (epoch ms); defaults to now. Imports keep their original time. */
  createdAt?: number;
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

/** The Summary model's structured result as the stored MeetingSummary. */
export function meetingSummaryOf(result: ProcessedResult): MeetingSummary {
  const structured = result.structuredSummary;
  return {
    overview: structured?.overview || result.summary,
    keyDiscussionPoints: structured?.keyDiscussionPoints || [],
    decisionsMade: structured?.decisionsMade || [],
    actionItems: (structured?.actionItems || []).map((a) => ({ text: a.text, owner: a.owner, dueDate: a.dueDate })),
    nextSteps: structured?.nextSteps || [],
  };
}

class TranscriptionService {
  /** Single entry point after transcription; saves everything atomically. */
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
        createdAt: result.createdAt ?? Date.now(),
      });

      console.log('[TranscriptionService] Saved transcription result for meeting:', meetingId);

      // Every meeting write passes here, so refetch all meetings queries instead of per-caller callbacks.
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch((error: unknown) =>
        console.error('[TranscriptionService] Failed to invalidate meetings query:', error)
      );

      // Integrations that mirror saved meetings (each a no-op unless switched on).
      void remindersSync.added(meetingId);
      void appleNotesSync.meetingSaved(meetingId);

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
