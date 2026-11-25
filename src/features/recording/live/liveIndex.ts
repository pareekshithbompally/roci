/** The meeting being recorded joins its search index as it's spoken: each time its transcript moves `indexStepMs` past what was
 *  indexed, the new lines are added to the meeting's pieces (embedded in the background), one stretch at a time, so chat's
 *  search finds them mid-meeting. No AI model is involved; saving the meeting indexes all of it as usual. */

import { indexStretch } from '@extensions/rag';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import type { LiveEntry } from './liveTranscript';
import { transcriptText } from './liveText';

interface Indexing {
  meetingId: string | null;
  /** Entries already added (or kept from before a reload), by source and start. */
  done: Set<string>;
  /** The end of the newest indexed entry (ms on the recording clock); the step counts from here. */
  coveredUntilMs: number;
  /** The stretch being added; the next waits for it. */
  queue: Promise<void>;
}

let indexing: Indexing = { meetingId: null, done: new Set(), coveredUntilMs: 0, queue: Promise.resolve() };

const keyOf = (entry: LiveEntry): string => `${entry.source}-${entry.startMs}`;

export const liveIndex = {
  /** A recording starts: a new one indexes from its first line; the same one again (a reload mid-recording) counts the lines it
   *  kept as indexed, which saving the meeting covers. */
  start(meetingId: string, kept: LiveEntry[]): void {
    if (indexing.meetingId === meetingId) return;
    indexing = {
      meetingId,
      done: new Set(kept.map(keyOf)),
      coveredUntilMs: Math.max(0, ...kept.map((e) => e.endMs)),
      queue: Promise.resolve(),
    };
  },

  /** The recording's lines changed: once they reach a step past what was indexed, the new ones join the index. */
  follow(meetingId: string, entries: LiveEntry[]): void {
    if (indexing.meetingId !== meetingId) return;
    const fresh = entries.filter((e) => !indexing.done.has(keyOf(e)));
    const newestMs = Math.max(indexing.coveredUntilMs, ...fresh.map((e) => e.endMs));
    if (fresh.length === 0 || newestMs - indexing.coveredUntilMs < LIVE.indexStepMs) return;
    fresh.forEach((e) => indexing.done.add(keyOf(e)));
    indexing.coveredUntilMs = newestMs;
    const text = transcriptText(fresh);
    indexing.queue = indexing.queue
      .then(() => indexStretch(meetingId, text))
      .then(() => undefined)
      .catch((error: unknown) => console.error('[liveIndex] Indexing a stretch failed:', error));
  },
};
