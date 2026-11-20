/** One-way import of Hex meetings as `hex-<id>` meetings; never deletes Roci's copy or writes to Hex. */

import { store } from '@services/db';
import { transcriptionService } from '@services/transcription.service';
import { hexMeetings, type HexEntry, type HexMeeting, type HexMeetingDetail } from './hex.meetings';
import type { MeetingSummary, StoredTranscriptSegment } from '@shared/types';
import { MEETING_LIVE_CONFIG } from '@config/meetingLive.config';
import { formatTranscript } from '@services/ai/transcription';

const ID_PREFIX = 'hex-';

/** A Hex meeting's `inputSource` in Roci. */
export const HEX_INPUT_SOURCE = 'hex';

export const rociMeetingId = (hexId: string): string => `${ID_PREFIX}${hexId}`;

/** A finished meeting with something to read (in-progress ones arrive later). */
const importable = (meeting: HexMeeting): boolean => !meeting.in_progress;

function segmentOf(entry: HexEntry): StoredTranscriptSegment {
  return { text: entry.text, startSecond: entry.start_ms / 1000, endSecond: entry.end_ms / 1000, speaker: MEETING_LIVE_CONFIG.speakers[entry.source] };
}

/** The meeting's own notes as a summary (catch-up keeps them instead of re-summarizing a backlog). */
function notesSummaryOf(notes: NonNullable<HexMeetingDetail['notes']>): MeetingSummary {
  return { overview: notes.summary, keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] };
}

/** Imports a finished meeting with its transcript in one write; false when there's nothing to import or Roci already has it
 *  (another import got there first). */
function importOne(detail: HexMeetingDetail): Promise<boolean> {
  if (!importable(detail.meeting) || detail.entries.length === 0) return Promise.resolve(false);
  const { formatted, segments } = formatTranscript({ text: '', segments: detail.entries.map(segmentOf) });
  return transcriptionService.importMeeting(
    { id: rociMeetingId(detail.meeting.id), title: detail.notes?.title || detail.meeting.title, inputSource: HEX_INPUT_SOURCE, createdAt: detail.meeting.timestamp_ms },
    { text: formatted, segments },
  );
}

/** What a catch-up did: meetings imported, those that came without Hex's notes (for the pipeline to summarize), and
 *  meetings that couldn't be imported (the next sync tries them again: nothing of theirs was written). */
export interface CatchUp {
  imported: number;
  toSummarize: string[];
  failed: number;
}

/** Keeps Hex's notes as the meeting's summary; true when it has notes and they were saved. */
async function keepNotes(meetingId: string, detail: HexMeetingDetail): Promise<boolean> {
  if (!detail.notes?.summary) return false;
  try {
    await transcriptionService.saveSummary({ meetingId, title: detail.notes.title || detail.meeting.title, summary: notesSummaryOf(detail.notes), categories: [] });
    return true;
  } catch (error: unknown) {
    console.error('[hexSync] Keeping Hex notes failed; the meeting is summarized instead:', meetingId, error);
    return false;
  }
}

/** One backlog meeting: imported with its transcript, then given Hex's notes, or left for the pipeline to summarize. */
async function catchUpOne(hexId: string, result: CatchUp): Promise<void> {
  const detail = await hexMeetings.show(hexId);
  if (!(await importOne(detail))) return;
  result.imported += 1;
  const meetingId = rociMeetingId(hexId);
  if (!(await keepNotes(meetingId, detail))) result.toSummarize.push(meetingId);
}

let catchingUp: Promise<CatchUp> | null = null;

/** Roci already keeps this Hex meeting (a light check: no transcript or notes are loaded). */
async function isKept(hexId: string): Promise<boolean> {
  return (await store.meetings.existing([rociMeetingId(hexId)])).length > 0;
}

/** Finished Hex meetings Roci doesn't have, in one store check (whether each is really new is still `importOne`'s answer). */
async function missingMeetings(): Promise<HexMeeting[]> {
  const finished = (await hexMeetings.list()).filter(importable);
  const kept = new Set(await store.meetings.existing(finished.map((m) => rociMeetingId(m.id))));
  return finished.filter((m) => !kept.has(rociMeetingId(m.id)));
}

/** Every finished meeting Roci doesn't have; one that fails is logged and counted, and the rest still import. */
async function runCatchUp(): Promise<CatchUp> {
  const result: CatchUp = { imported: 0, toSummarize: [], failed: 0 };
  for (const meeting of await missingMeetings()) {
    await catchUpOne(meeting.id, result).catch((error: unknown) => {
      console.error('[hexSync] Import failed:', meeting.id, error);
      result.failed += 1;
    });
  }
  return result;
}

export const hexSync = {
  /** Imports every meeting Roci doesn't have yet. One run at a time. */
  catchUp(): Promise<CatchUp> {
    catchingUp ??= runCatchUp().finally(() => { catchingUp = null; });
    return catchingUp;
  },

  /** A meeting that just finished: imported for the pipeline to summarize. Resolves its id when it is new to Roci. */
  async finished(hexId: string): Promise<string | null> {
    if (await isKept(hexId)) return null;
    return (await importOne(await hexMeetings.show(hexId))) ? rociMeetingId(hexId) : null;
  },
};
