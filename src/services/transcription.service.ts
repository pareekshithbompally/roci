/** Saves a meeting's transcript and summary; each save advances its status and refreshes every meetings view. */

import type { MeetingSummary, ProcessedResult, StoredTranscriptSegment } from '@shared/types';
import { store } from '@services/db';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { formatMeetingSummary } from './searchIndexing.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersSync } from '@services/reminders';
import { appleNotesSync } from '@services/appleNotes';

/** The Summary model's structured result as the stored MeetingSummary. */
export function meetingSummaryOf(result: ProcessedResult): MeetingSummary {
  const structured = result.structuredSummary;
  return {
    overview: structured?.overview || result.summary,
    keyDiscussionPoints: structured?.keyDiscussionPoints || [],
    decisionsMade: structured?.decisionsMade || [],
    actionItems: (structured?.actionItems || []).map((a) => ({
      text: a.text,
      owner: a.owner,
      dueDate: a.dueDate ? normalizeDueDate(a.dueDate) : undefined,
    })),
    nextSteps: structured?.nextSteps || [],
  };
}

function refreshMeetings(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch((error: unknown) =>
    console.error('[TranscriptionService] Failed to invalidate meetings query:', error),
  );
}

interface SummarySave {
  meetingId: string;
  title: string;
  transcript: string;
  summary: MeetingSummary;
  categories: string[];
}

function indexForSearch(saved: SummarySave): void {
  const item = {
    id: saved.meetingId,
    title: saved.title,
    transcript: saved.transcript,
    summary: formatMeetingSummary(saved.summary),
    categories: saved.categories,
    timestamp: Date.now(),
  };
  import('@extensions/rag/indexer')
    .then(({ ragIndexer }) => ragIndexer.indexMeeting(item, { includeEmbeddings: false }))
    .catch((error: unknown) => console.error('[TranscriptionService] Meeting indexing failed (non-fatal):', saved.meetingId, error));
}

export const transcriptionService = {
  /** Saves the transcript (meeting → `transcribed`). Throws when the store write fails. */
  async saveTranscript(input: {
    meetingId: string;
    text: string;
    model?: string;
    language?: string;
    segments?: StoredTranscriptSegment[];
  }): Promise<void> {
    await store.meetings.saveTranscript({
      meetingId: input.meetingId,
      text: input.text,
      model: input.model,
      language: input.language,
      segments: input.segments?.length ? JSON.stringify(input.segments) : undefined,
    });
    refreshMeetings();
  },

  /** Saves the summary (meeting → `ready`), then mirrors it to search and the switched-on integrations. */
  async saveSummary(input: SummarySave): Promise<void> {
    await store.meetings.saveSummary(input);
    refreshMeetings();
    void remindersSync.added(input.meetingId);
    void appleNotesSync.meetingSaved(input.meetingId);
    indexForSearch(input);
  },
};
