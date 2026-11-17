import type { TranscriptResult } from './types';
import type { StoredTranscriptSegment } from '@shared/types';

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatTranscript(r: TranscriptResult): {
  formatted: string;
  segments: StoredTranscriptSegment[];
} {
  const stored: StoredTranscriptSegment[] = r.segments.map((seg) => ({
    text: seg.text,
    startSecond: seg.startSecond,
    endSecond: seg.endSecond,
    speaker: seg.speaker,
  }));

  if (stored.length > 0) {
    const formatted = stored
      .map((seg) => {
        const prefix = seg.speaker
          ? `[${formatTimestamp(seg.startSecond)}] ${seg.speaker}: ${seg.text}`
          : `[${formatTimestamp(seg.startSecond)}] ${seg.text}`;
        return prefix;
      })
      .join('\n');
    return { formatted, segments: stored };
  }
  return { formatted: r.text, segments: [] };
}

/** Non-speech markers some engines emit for sound they heard (`<noise>`, `[BLANK_AUDIO]`, `[MUSIC]`). */
const NON_SPEECH_TAG = /<[^<>]*>|\[[A-Z_ ]+\]/g;

/** Dictated text without the engine's non-speech markers; empty when nothing was said. */
export function stripNonSpeech(text: string): string {
  return text.replace(NON_SPEECH_TAG, ' ').replace(/\s+/g, ' ').trim();
}
