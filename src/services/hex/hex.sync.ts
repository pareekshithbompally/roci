/**
 * hexSync — one-way import of Hex meetings into Kasset (Hex → Kasset only).
 *
 * Each Hex meeting becomes the Kasset meeting `hex-<id>`, saved through the same
 * path as every other meeting (list, search index, Reminders). Catch-up imports
 * with Hex's own notes; a meeting that finishes while Kasset runs is then
 * summarized with the user's Summary model (its phase shows in the meeting view).
 * Deleting in Hex never deletes Kasset's copy; Kasset never writes to Hex.
 */

import { store } from '@services/db';
import { transcriptionService, meetingSummaryOf } from '@services/transcription.service';
import { unifiedAIService } from '@services/unifiedAIService';
import { meetingJobs } from '@shared/stores/meetingJobsStore';
import { hexMeetings, type HexEntry, type HexMeeting, type HexMeetingDetail } from './hex.meetings';
import type { TranscriptionResult } from '@services/transcription.service';
import type { AppSettings, StoredTranscriptSegment } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';

const ID_PREFIX = 'hex-';
const SPEAKER = { microphone: 'You', system: 'Them' } as const;

/** What summarizing a finished meeting needs from the app. */
export interface SummaryContext {
  settings: AppSettings;
  providers: ModelProvider[];
  categories: string[];
}

export const kassetMeetingId = (hexId: string): string => `${ID_PREFIX}${hexId}`;

/** A finished meeting with something to read (in-progress ones arrive later). */
const importable = (meeting: HexMeeting): boolean => !meeting.in_progress;

function segmentOf(entry: HexEntry): StoredTranscriptSegment {
  return { text: entry.text, startSecond: entry.start_ms / 1000, endSecond: entry.end_ms / 1000, speaker: SPEAKER[entry.source] };
}

/** Hex's meeting as a Kasset save: transcript + Hex's own title and summary. */
export function toTranscriptionResult(detail: HexMeetingDetail): TranscriptionResult {
  const segments = detail.entries.map(segmentOf);
  return {
    meetingId: kassetMeetingId(detail.meeting.id),
    title: detail.notes?.title || detail.meeting.title,
    transcript: segments.map((s) => `${s.speaker}: ${s.text}`).join('\n'),
    summary: { overview: detail.notes?.summary ?? '', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] },
    categories: [],
    inputSource: 'hex',
    segments,
    createdAt: detail.meeting.timestamp_ms,
  };
}

async function exists(hexId: string): Promise<boolean> {
  return (await store.meetings.get(kassetMeetingId(hexId))) !== null;
}

/** Saves one Hex meeting with Hex's notes; returns the save, or null when there's nothing to import. */
async function importOne(hexId: string): Promise<TranscriptionResult | null> {
  const detail = await hexMeetings.show(hexId);
  if (!importable(detail.meeting) || detail.entries.length === 0) return null;
  const result = toTranscriptionResult(detail);
  await transcriptionService.saveTranscriptionResult(result);
  return result;
}

/** The user's Summary model over an imported meeting; the meeting phase reports progress/failure. */
async function summarize(saved: TranscriptionResult, context: SummaryContext): Promise<void> {
  meetingJobs.set(saved.meetingId, { stage: 'summarizing' });
  try {
    const result = await unifiedAIService.processTranscript(
      saved.transcript, saved.segments, context.categories, context.settings, context.providers,
      { meetingId: saved.meetingId },
    );
    await transcriptionService.saveTranscriptionResult({
      ...saved,
      title: result.title || saved.title,
      summary: meetingSummaryOf(result),
      categories: result.categories ?? [],
    });
    meetingJobs.clear(saved.meetingId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Summary failed';
    meetingJobs.set(saved.meetingId, { stage: 'failed', failedAt: 'summarize', message });
  }
}

let catchingUp: Promise<number> | null = null;

async function runCatchUp(): Promise<number> {
  const meetings = await hexMeetings.list();
  let imported = 0;
  for (const meeting of meetings.filter(importable)) {
    if (await exists(meeting.id)) continue;
    if (await importOne(meeting.id)) imported += 1;
  }
  return imported;
}

export const hexSync = {
  /** Imports every Hex meeting Kasset doesn't have yet (with Hex's notes). One run at a time. */
  catchUp(): Promise<number> {
    catchingUp ??= runCatchUp().finally(() => { catchingUp = null; });
    return catchingUp;
  },

  /** A meeting Hex just finished: import, then summarize with the user's Summary model. Resolves whether it was new. */
  async finished(hexId: string, context: SummaryContext): Promise<boolean> {
    if (await exists(hexId)) return false;
    const saved = await importOne(hexId);
    if (!saved) return false;
    await summarize(saved, context);
    return true;
  },
};
