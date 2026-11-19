/** Saves a meeting's transcript and summary; each save advances its status and refreshes every meetings view. */

import type { MeetingSummary, ProcessedResult, StoredTranscriptSegment } from '@shared/types';
import { store } from '@services/db';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { searchIndexingService } from './searchIndexing.service';
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
    enhancedNotes: structured?.enhancedNotes,
  };
}

interface SummarySave {
  meetingId: string;
  title: string;
  summary: MeetingSummary;
  categories: string[];
}

export const transcriptionService = {
  /** Saves the transcript (meeting → `transcribed`; the store announces it). Throws when the store write fails. */
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
  },

  /** Saves the summary (meeting → `ready`, done), then indexes it in full for search and mirrors it to the switched-on integrations. */
  async saveSummary(input: SummarySave): Promise<void> {
    const replacedTodoIds = await store.meetings.saveSummary(input);
    void remindersSync.removed(replacedTodoIds);
    void remindersSync.addedForMeeting(input.meetingId);
    void appleNotesSync.meetingSaved(input.meetingId);
    searchIndexingService.indexMeeting(input.meetingId).catch((error: unknown) =>
      console.error('[TranscriptionService] Meeting indexing failed (non-fatal):', input.meetingId, error));
  },
};
