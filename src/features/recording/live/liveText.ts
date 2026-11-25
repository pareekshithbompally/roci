/** The in-call transcript as text a model reads: one line per entry, in time order, labelled by who spoke. */

import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { formatClock } from '@shared/utils/formatters';
import type { LiveEntry } from './liveTranscript';

const clock = (ms: number) => formatClock(Math.floor(ms / 1_000));

export function transcriptText(entries: LiveEntry[]): string {
  return [...entries]
    .sort((a, b) => a.startMs - b.startMs)
    .map((e) => `${e.timed ? `[${clock(e.startMs)}] ` : ''}${LIVE.speakers[e.source]}: ${e.text}`)
    .join('\n');
}

/** The newest `chars` of `text`, from the start of a line. */
export function latestOf(text: string, chars: number): string {
  if (text.length <= chars) return text;
  const tail = text.slice(-chars);
  const lineStart = tail.indexOf('\n');
  return lineStart >= 0 ? tail.slice(lineStart + 1) : tail;
}
