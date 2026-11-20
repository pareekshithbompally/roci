/** Turns any stored transcript into speaker turns; plain-text imports are cleaned, split by speaker and reflowed. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { formatDuration } from '@shared/utils/formatters';
import type { StoredTranscriptSegment } from '@shared/types';

export interface TranscriptBlock {
  speaker?: string;
  text: string;
  /** The silence before this turn ("1:12"), when long enough to mark. */
  silenceBefore?: string;
}

const SPEAKER_LINE = /^\[([^\]\d][^\]]*)\]$/;
const TIME_PREFIX = /^\[(\d{1,2}:\d{2})\]\s*/;
const SENTENCE_END = /[.!?…]["')\]]?$/;

/** Speaker turns: a speaker's lines closer than the join gap are one turn; a long silence before a turn is marked. */
export function blocksFromSegments(segments: StoredTranscriptSegment[]): TranscriptBlock[] {
  const { joinGapSeconds, markSilenceSeconds } = TRANSCRIPTION_CONFIG.turns;
  const blocks: TranscriptBlock[] = [];
  let heardUntil: number | null = null;
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const speaker = segment.speaker || undefined;
    const gap = heardUntil === null ? 0 : segment.startSecond - heardUntil;
    const turn = blocks.at(-1);
    if (turn && turn.speaker === speaker && gap <= joinGapSeconds) turn.text = `${turn.text} ${text}`;
    else blocks.push({ speaker, text, silenceBefore: gap >= markSilenceSeconds ? formatDuration(gap) : undefined });
    heardUntil = Math.max(heardUntil ?? 0, segment.endSecond);
  }
  return blocks;
}

/** Clean caption lines: strip artifacts, drop blanks and immediate repeats. */
function cleanLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\\h/g, ' ').replace(/\s+/g, ' ').trim();
    if (line && line !== out[out.length - 1]) out.push(line);
  }
  return out;
}

export function blocksFromText(text: string): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let current: TranscriptBlock = { text: '' };
  let speaker: string | undefined;

  const flush = () => {
    if (current.text) blocks.push(current);
    current = { speaker, text: '' };
  };

  for (const line of cleanLines(text)) {
    const turn = line.match(SPEAKER_LINE);
    if (turn) {
      flush();
      speaker = turn[1].trim();
      current.speaker = speaker;
      continue;
    }
    const time = line.match(TIME_PREFIX);
    if (time) flush();
    const body = time ? line.slice(time[0].length) : line;
    current.text = current.text ? `${current.text} ${body}` : body;
    if (current.text.length >= TRANSCRIPTION_CONFIG.paragraphChars && SENTENCE_END.test(body)) flush();
  }
  flush();
  return blocks;
}

export function toTranscriptBlocks(text?: string, segments?: StoredTranscriptSegment[]): TranscriptBlock[] {
  if (segments && segments.length > 0) return blocksFromSegments(segments);
  return text ? blocksFromText(text) : [];
}
