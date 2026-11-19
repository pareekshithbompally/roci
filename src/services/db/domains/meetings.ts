/** Meetings domain — list/get/create/update/delete meetings, move their pipeline status, save transcript and summary. */

import { parseStoreError } from '@services/db/errors';
import { parseMeetingSummary } from '@core/ai';
import {
  call,
  rustNoteToEntry,
  rustTodoToEntry,
  toMeetingIndexEntry,
} from '@services/db/internal';
import type { MeetingIndexEntry, TranscriptData, RecordingMeta, MeetingDetail, MeetingSummary } from '@shared/types';
import type { MeetingStatus, MeetingStep, MeetingStepEnd } from '@shared/types/meetingPhase';
import type {
  MeetingCreateInput,
  MeetingDetailRow,
  MeetingListResult,
  MeetingUpsertInput,
  MeetingsDeleteResult,
  SummarySaveInput,
  TranscriptSaveInput,
} from '@shared/types/native';

function toDetail(result: MeetingDetailRow): MeetingDetail {
  const recording = result.recordings[0];
  const index = toMeetingIndexEntry({ ...result, recording_filename: recording?.filename ?? null });
  const detail: MeetingDetail = {
    index,
    notes: result.notes.map(rustNoteToEntry),
    todos: result.todos.map(rustTodoToEntry),
  };

  if (result.transcript) {
    const t = result.transcript;
    const transcriptData: TranscriptData = { text: t.text, createdAt: new Date(t.created_at).toISOString() };
    if (t.language) transcriptData.language = t.language;
    if (t.model) transcriptData.model = t.model;
    if (t.segments) transcriptData.segments = JSON.parse(t.segments);
    detail.transcript = transcriptData;
  }

  if (result.summary) {
    detail.summary = parseMeetingSummary({ ...JSON.parse(result.summary.data), overview: result.summary.overview });
  }

  if (recording) {
    detail.recording = {
      filename: recording.filename,
      createdAt: new Date(recording.created_at).toISOString(),
      ...(recording.duration_seconds != null && recording.duration_seconds > 0 ? { duration: recording.duration_seconds } : {}),
      ...(recording.input_source ? { inputSource: recording.input_source } : {}),
    } as RecordingMeta;
  }

  return detail;
}

const toCalendarMeta = (meta?: Record<string, unknown>): string | null => (meta ? JSON.stringify(meta) : null);

export const meetings = {
  /** List meetings, paginated. */
  async list(limit = 50, offset = 0): Promise<{ items: MeetingIndexEntry[]; total: number }> {
    const result = await call<MeetingListResult>('meetings_list', { limit, offset });
    return { items: result.items.map(toMeetingIndexEntry), total: result.total };
  },

  /** Full meeting detail with transcript, summary, notes, todos, recording; null when missing. */
  async get(id: string): Promise<MeetingDetail | null> {
    try {
      return toDetail(await call<MeetingDetailRow>('meetings_get', { id }));
    } catch (error: unknown) {
      const storeErr = parseStoreError(error);
      if (storeErr.code === 'not_found') return null;
      throw storeErr;
    }
  },

  /** A new meeting at the start of its pipeline (imports; recordings are created by the recorder). */
  async create(input: {
    id: string;
    title: string;
    status: MeetingStatus['status'];
    inputSource?: string;
    recordingFilename?: string;
    calendarEventId?: string;
    calendarMeta?: Record<string, unknown>;
    createdAt?: number;
  }): Promise<void> {
    await call<void>('meetings_create', {
      input: {
        id: input.id,
        title: input.title,
        status: input.status,
        input_source: input.inputSource ?? null,
        recording_filename: input.recordingFilename ?? null,
        calendar_event_id: input.calendarEventId ?? null,
        calendar_meta: toCalendarMeta(input.calendarMeta),
        created_at: input.createdAt ?? null,
      } satisfies MeetingCreateInput,
    });
  },

  /** Update a meeting; only the fields given change. */
  async upsert(input: {
    id: string;
    title?: string;
    inputSource?: string;
    calendarEventId?: string;
    calendarMeta?: Record<string, unknown>;
    categories?: string[];
    createdAt?: number;
  }): Promise<void> {
    await call<void>('meetings_upsert', {
      input: {
        id: input.id,
        title: input.title ?? null,
        input_source: input.inputSource ?? null,
        calendar_event_id: input.calendarEventId ?? null,
        calendar_meta: toCalendarMeta(input.calendarMeta),
        categories: input.categories ?? null,
        created_at: input.createdAt ?? null,
      } satisfies MeetingUpsertInput,
    });
  },

  /** Starts a pipeline step (the meeting shows it running); false when this meeting already runs one, which is left alone. */
  async beginStep(id: string, step: MeetingStep): Promise<boolean> {
    return call<boolean>('meetings_begin_step', { id, step });
  },

  /** Ends a step: `done` (its save moved the meeting on), `cancelled` (back to waiting for it) or `failed` with the reason. */
  async endStep(id: string, step: MeetingStep, end: MeetingStepEnd): Promise<void> {
    await call<void>('meetings_end_step', { id, step, end });
  },

  /** The user's own title: a summary never replaces it. */
  async rename(id: string, title: string): Promise<void> {
    await call<void>('meetings_rename', { id, title });
  },

  /** Save the transcript; the meeting becomes `transcribed`. */
  async saveTranscript(input: {
    meetingId: string;
    text: string;
    language?: string;
    model?: string;
    segments?: string;
  }): Promise<void> {
    await call<void>('transcripts_save', {
      input: {
        meeting_id: input.meetingId,
        text: input.text,
        language: input.language ?? null,
        model: input.model ?? null,
        segments: input.segments ?? null,
      } satisfies TranscriptSaveInput,
    });
  },

  /**
   * Save the summary with its title, categories and action items; the meeting becomes `ready`.
   * Resolves the ids of the untouched AI to-dos the new action items replaced.
   */
  async saveSummary(input: { meetingId: string; title: string; summary: MeetingSummary; categories: string[] }): Promise<string[]> {
    const { summary } = input;
    return call<string[]>('summaries_save', {
      input: {
        meeting_id: input.meetingId,
        title: input.title,
        overview: summary.overview,
        data: JSON.stringify({
          keyDiscussionPoints: summary.keyDiscussionPoints,
          decisionsMade: summary.decisionsMade,
          actionItems: summary.actionItems,
          nextSteps: summary.nextSteps,
          enhancedNotes: summary.enhancedNotes,
        }),
        categories: input.categories,
        action_items: summary.actionItems.map((a) => ({ text: a.text, owner: a.owner ?? null, due_date: a.dueDate ?? null })),
      } satisfies SummarySaveInput,
    });
  },

  /** Delete a meeting and all its cascading children. Returns recording filenames for cleanup. */
  async delete(id: string): Promise<{ recordingFilenames: string[] }> {
    const result = await call<MeetingsDeleteResult>('meetings_delete', { id });
    return { recordingFilenames: result.recording_filenames };
  },
};

