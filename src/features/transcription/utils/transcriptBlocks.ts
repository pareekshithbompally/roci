/** Turns any stored transcript into blocks; plain-text imports are cleaned, split by speaker and reflowed. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { StoredTranscriptSegment } from '@shared/types';

export interface TranscriptBlock {
  speaker?: string;
  /** "MM:SS", when the source carries timing */
  time?: string;
  text: string;
}

const SPEAKER_LINE = /^\[([^\]\d][^\]]*)\]$/;
const TIME_PREFIX = /^\[(\d{1,2}:\d{2})\]\s*/;
const SENTENCE_END = /[.!?…]["')\]]?$/;

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function blocksFromSegments(segments: StoredTranscriptSegment[]): TranscriptBlock[] {
  const timed = segments.some((s) => s.startSecond > 0 || s.endSecond > 0);
  return segments.map((s) => ({
    speaker: s.speaker || undefined,
    time: timed ? formatTimestamp(s.startSecond) : undefined,
    text: s.text.trim(),
  }));
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
    if (time) {
      flush();
      current.time = time[1];
    }
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
