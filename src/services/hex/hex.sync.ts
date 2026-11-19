/** One-way import of Hex meetings as `hex-<id>` meetings; never deletes Roci's copy or writes to Hex. */

import { store } from '@services/db';
import { transcriptionService } from '@services/transcription.service';
import { hexMeetings, type HexEntry, type HexMeeting, type HexMeetingDetail } from './hex.meetings';
import type { MeetingSummary, StoredTranscriptSegment } from '@shared/types';
import { MEETING_LIVE_CONFIG } from '@config/meetingLive.config';
import { formatTranscript } from '@services/ai/transcription';

const ID_PREFIX = 'hex-';

export const rociMeetingId = (hexId: string): string => `${ID_PREFIX}${hexId}`;

/** A finished meeting with something to read (in-progress ones arrive later). */
const importable = (meeting: HexMeeting): boolean => !meeting.in_progress;

function segmentOf(entry: HexEntry): StoredTranscriptSegment {
  return { text: entry.text, startSecond: entry.start_ms / 1000, endSecond: entry.end_ms / 1000, speaker: MEETING_LIVE_CONFIG.speakers[entry.source] };
}

/** The meeting's own notes as a summary (catch-up keeps them instead of re-summarizing). */
function notesSummaryOf(detail: HexMeetingDetail): MeetingSummary {
  return { overview: detail.notes?.summary ?? '', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] };
}

async function exists(hexId: string): Promise<boolean> {
  return (await store.meetings.get(rociMeetingId(hexId))) !== null;
}

/** Creates the meeting with its transcript (`transcribed`); null when there's nothing to import. */
async function importOne(detail: HexMeetingDetail): Promise<{ meetingId: string } | null> {
  if (!importable(detail.meeting) || detail.entries.length === 0) return null;
  const meetingId = rociMeetingId(detail.meeting.id);
  const { formatted, segments } = formatTranscript({ text: '', segments: detail.entries.map(segmentOf) });
  await store.meetings.create({
    id: meetingId,
    title: detail.notes?.title || detail.meeting.title,
    status: 'transcribed',
    inputSource: 'hex',
    createdAt: detail.meeting.timestamp_ms,
  });
  await transcriptionService.saveTranscript({ meetingId, text: formatted, segments });
  return { meetingId };
}

let catchingUp: Promise<number> | null = null;

async function runCatchUp(): Promise<number> {
  const meetings = await hexMeetings.list();
  let imported = 0;
  for (const meeting of meetings.filter(importable)) {
    if (await exists(meeting.id)) continue;
    const detail = await hexMeetings.show(meeting.id);
    const saved = await importOne(detail);
    if (!saved) continue;
    await transcriptionService.saveSummary({
      ...saved,
      title: detail.notes?.title || detail.meeting.title,
      summary: notesSummaryOf(detail),
      categories: [],
    });
    imported += 1;
  }
  return imported;
}

export const hexSync = {
  /** Imports every meeting Roci doesn't have yet, with the notes it came with. One run at a time. */
  catchUp(): Promise<number> {
    catchingUp ??= runCatchUp().finally(() => { catchingUp = null; });
    return catchingUp;
  },

  /** A meeting that just finished: import its transcript for the pipeline to summarize. Resolves its id when new. */
  async finished(hexId: string): Promise<string | null> {
    if (await exists(hexId)) return null;
    const imported = await importOne(await hexMeetings.show(hexId));
    return imported?.meetingId ?? null;
  },
};
