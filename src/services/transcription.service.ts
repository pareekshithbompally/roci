/** Saves a meeting's transcript and summary; each save advances its status, and the store announces it (meeting://changed). */

import type { MeetingSummary, StoredTranscriptSegment } from '@shared/types';
import { store } from '@services/db';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { searchIndexingService } from './searchIndexing.service';
import { remindersSync } from '@services/reminders';
import { appleNotesSync } from '@services/appleNotes';

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
    // due dates as the to-dos store them (YYYY-MM-DD), whatever form the model wrote them in
    const actionItems = input.summary.actionItems.map((a) => ({ ...a, dueDate: a.dueDate ? normalizeDueDate(a.dueDate) : undefined }));
    const replacedTodoIds = await store.meetings.saveSummary({ ...input, summary: { ...input.summary, actionItems } });
    void remindersSync.removed(replacedTodoIds);
    void remindersSync.addedForMeeting(input.meetingId);
    void appleNotesSync.meetingSaved(input.meetingId);
    searchIndexingService.indexMeeting(input.meetingId).catch((error: unknown) =>
      console.error('[TranscriptionService] Meeting indexing failed (non-fatal):', input.meetingId, error));
  },
};
