/** Saves a meeting's transcript and summary; each save advances its status, and the store announces it (meeting://changed). */

import type { MeetingSummary, StoredTranscriptSegment } from '@shared/types';
import type { NewTranscript } from '@shared/types/native';
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

interface TranscriptInput {
  text: string;
  model?: string;
  language?: string;
  segments?: StoredTranscriptSegment[];
}

/** A transcript as the store keeps it: segments as JSON, none when there are none. */
const transcriptRow = ({ text, model, language, segments }: TranscriptInput): NewTranscript => ({
  text,
  model: model ?? null,
  language: language ?? null,
  segments: segments?.length ? JSON.stringify(segments) : null,
});

/** Re-indexes the meeting for search after a save; a failure is logged, the save stands. */
function indexInBackground(meetingId: string): void {
  searchIndexingService.indexMeeting(meetingId).catch((error: unknown) =>
    console.error('[TranscriptionService] Meeting indexing failed (non-fatal):', meetingId, error));
}

export const transcriptionService = {
  /** Saves the transcript (meeting → `transcribed`; the store announces it). Throws when the store write fails. */
  async saveTranscript({ meetingId, ...transcript }: TranscriptInput & { meetingId: string }): Promise<void> {
    await store.meetings.saveTranscript(meetingId, transcriptRow(transcript));
    indexInBackground(meetingId);
  },

  /** A meeting that arrives with its transcript (an import): one write, so it is never without it, and it starts `transcribed`.
   *  False when a meeting with this id already exists; it is left as it is. */
  async importMeeting(
    meeting: { id: string; title: string; inputSource: string; createdAt?: number },
    transcript: TranscriptInput,
  ): Promise<boolean> {
    const created = await store.meetings.create({ ...meeting, status: 'transcribed', transcript: transcriptRow(transcript) });
    if (created) indexInBackground(meeting.id);
    return created;
  },

  async saveSummary(input: SummarySave): Promise<void> {
    // due dates as the to-dos store them (YYYY-MM-DD), whatever form the model wrote them in
    const actionItems = input.summary.actionItems.map((a) => ({ ...a, dueDate: a.dueDate ? normalizeDueDate(a.dueDate) : undefined }));
    const saved = await store.meetings.saveSummary({ ...input, summary: { ...input.summary, actionItems } });
    // Reminders mirror exactly what changed: the replaced AI to-dos go, only the new ones are added
    void remindersSync.removed(saved.replaced_todo_ids);
    void remindersSync.added(saved.new_todo_ids);
    void appleNotesSync.meetingSaved(input.meetingId);
    indexInBackground(input.meetingId);
  },
};
