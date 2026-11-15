/** Meetings domain — list/get/upsert/delete meetings and save transcription results. */

import { parseStoreError } from '@services/db/errors';
import { call, rustNoteToEntry, rustTodoToEntry, toMeetingIndexEntry } from '@services/db/internal';
import type {
  MeetingIndexEntry,
  TranscriptData,
  RecordingMeta,
  MeetingDetail,
} from '@shared/types';

export const meetings = {
  /** List meetings, paginated. */
  async list(limit = 50, offset = 0): Promise<{ items: MeetingIndexEntry[]; total: number }> {
    const result = await call<{
      items: Array<{
        id: string;
        title: string;
        input_source: string | null;
        pending_transcription: boolean;
        calendar_event_id: string | null;
        calendar_meta: string | null;
        created_at: number;
        updated_at: number;
        categories: string[];
        recording_filename: string | null;
      }>;
      total: number;
    }>('meetings_list', { limit, offset });

    return {
      items: result.items.map(toMeetingIndexEntry),
      total: result.total,
    };
  },

  /** Get full meeting detail with transcripts, summaries, notes, todos, recordings. */
  async get(id: string): Promise<MeetingDetail | null> {
    try {
      const result = await call<{
        id: string;
        title: string;
        input_source: string | null;
        pending_transcription: boolean;
        calendar_event_id: string | null;
        calendar_meta: string | null;
        created_at: number;
        updated_at: number;
        categories: string[];
        transcript: { text: string; language: string | null; model: string | null; segments: string | null; created_at: number } | null;
        summary: { overview: string; data: string; created_at: number; updated_at: number } | null;
        recordings: Array<{ id: string; filename: string; duration_seconds: number | null; input_source: string | null; created_at: number }>;
        notes: Array<{ id: string; text: string; created_at: number; updated_at: number }>;
        todos: Array<{ id: string; text: string; owner: string | null; due_date: string | null; completed: boolean; source: string; created_at: number }>;
      }>('meetings_get', { id });

      const index: MeetingIndexEntry = {
        id: result.id,
        title: result.title,
        categories: result.categories,
        recordingFileName: result.recordings.length > 0 ? result.recordings[0].filename : undefined,
        inputSource: (result.input_source ?? undefined) as MeetingIndexEntry['inputSource'],
        pendingTranscription: result.pending_transcription,
        createdAt: new Date(result.created_at).toISOString(),
        updatedAt: new Date(result.updated_at).toISOString(),
      };
      if (result.calendar_event_id) index.calendarEventId = result.calendar_event_id;
      if (result.calendar_meta) {
        try {
          const cm = JSON.parse(result.calendar_meta);
          if (cm.scheduledTitle) index.scheduledTitle = cm.scheduledTitle;
          if (cm.participants) index.participants = cm.participants;
          if (cm.scheduledStart) index.scheduledStart = cm.scheduledStart;
          if (cm.scheduledEnd) index.scheduledEnd = cm.scheduledEnd;
          if (cm.meetingUrl) index.meetingUrl = cm.meetingUrl;
        } catch { /* ignore malformed JSON */ }
      }

      const detail: MeetingDetail = {
        index,
        notes: result.notes.map(rustNoteToEntry),
        todos: result.todos.map(rustTodoToEntry),
      };

      if (result.transcript) {
        const t = result.transcript;
        const transcriptData: TranscriptData = {
          text: t.text,
          createdAt: new Date(t.created_at).toISOString(),
        };
        if (t.language) transcriptData.language = t.language;
        if (t.model) transcriptData.model = t.model;
        if (t.segments) transcriptData.segments = JSON.parse(t.segments);
        detail.transcript = transcriptData;
      }

      if (result.summary) {
        const s = result.summary;
        const summaryData = JSON.parse(s.data);
        detail.summary = {
          overview: s.overview,
          keyDiscussionPoints: summaryData.keyDiscussionPoints ?? [],
          decisionsMade: summaryData.decisionsMade ?? [],
          actionItems: summaryData.actionItems ?? [],
          nextSteps: summaryData.nextSteps ?? [],
        };
      }

      if (result.recordings.length > 0) {
        const r = result.recordings[0];
        detail.recording = {
          filename: r.filename,
          createdAt: new Date(r.created_at).toISOString(),
          ...(r.duration_seconds != null && r.duration_seconds > 0 ? { duration: r.duration_seconds } : {}),
          ...(r.input_source ? { inputSource: r.input_source } : {}),
        } as RecordingMeta;
      }

      return detail;
    } catch (error: unknown) {
      const storeErr = parseStoreError(error);
      if (storeErr.code === 'not_found') return null;
      throw storeErr;
    }
  },

  /** Create or update a meeting. */
  async upsert(input: {
    id: string;
    title: string;
    inputSource?: string;
    pendingTranscription?: boolean;
    calendarEventId?: string;
    calendarMeta?: Record<string, unknown>;
    categories?: string[];
    createdAt?: number;
  }): Promise<void> {
    await call<void>('meetings_upsert', {
      input: {
        id: input.id,
        title: input.title,
        input_source: input.inputSource ?? null,
        pending_transcription: input.pendingTranscription ?? null,
        calendar_event_id: input.calendarEventId ?? null,
        calendar_meta: input.calendarMeta ? JSON.stringify(input.calendarMeta) : null,
        categories: input.categories ?? null,
        created_at: input.createdAt ?? null,
      },
    });
  },

  /** Delete a meeting and all its cascading children. Returns recording filenames for cleanup. */
  async delete(id: string): Promise<{ recordingFilenames: string[] }> {
    const result = await call<{ recording_filenames: string[] }>('meetings_delete', { id });
    return { recordingFilenames: result.recording_filenames };
  },

  /** Save transcription result (atomic: meeting + transcript + summary + todos + recording). */
  async saveTranscription(input: {
    meetingId: string;
    title: string;
    transcript: string;
    transcriptLanguage?: string;
    transcriptModel?: string;
    transcriptSegments?: string;
    summaryOverview: string;
    summaryData: string;
    categories?: string[];
    recordingFilename?: string;
    recordingDuration?: number;
    recordingInputSource?: string;
    inputSource?: string;
    calendarMeta?: Record<string, unknown>;
    actionItems?: Array<{ text: string; owner?: string; dueDate?: string }>;
    createdAt?: number;
  }): Promise<void> {
    await call<void>('save_transcription', {
      input: {
        meeting_id: input.meetingId,
        title: input.title,
        transcript: input.transcript,
        transcript_language: input.transcriptLanguage ?? null,
        transcript_model: input.transcriptModel ?? null,
        transcript_segments: input.transcriptSegments ?? null,
        summary_overview: input.summaryOverview,
        summary_data: input.summaryData,
        categories: input.categories ?? null,
        recording_filename: input.recordingFilename ?? null,
        recording_duration: input.recordingDuration ?? null,
        recording_input_source: input.recordingInputSource ?? null,
        input_source: input.inputSource ?? null,
        calendar_meta: input.calendarMeta ? JSON.stringify(input.calendarMeta) : null,
        action_items: input.actionItems ?? null,
        created_at: input.createdAt ?? null,
      },
    });
  },
};
