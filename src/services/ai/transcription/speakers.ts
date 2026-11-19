/** Who said each line of a transcript, from a reference transcript that knows: each segment takes the speaker the reference
 *  heard longest over its span (the in-call draft, whose lines come from the user's microphone and the call separately).
 *  A segment the reference heard nothing over keeps what it had. */

import type { TranscriptResult, TranscriptSegment } from './types';

/** How long each labelled reference segment overlaps [start, end), summed per speaker. */
function overlapBySpeaker(start: number, end: number, reference: readonly TranscriptSegment[]): Map<string, number> {
  const heard = new Map<string, number>();
  for (const line of reference) {
    const overlap = Math.min(line.endSecond, end) - Math.max(line.startSecond, start);
    if (line.speaker && overlap > 0) heard.set(line.speaker, (heard.get(line.speaker) ?? 0) + overlap);
  }
  return heard;
}

function speakerOf(segment: TranscriptSegment, reference: readonly TranscriptSegment[]): string | undefined {
  const heard = [...overlapBySpeaker(segment.startSecond, segment.endSecond, reference)];
  return heard.sort(([, a], [, b]) => b - a)[0]?.[0] ?? segment.speaker;
}

export function labelSpeakers(result: TranscriptResult, reference: readonly TranscriptSegment[]): TranscriptResult {
  if (reference.length === 0) return result;
  return { ...result, segments: result.segments.map((segment) => ({ ...segment, speaker: speakerOf(segment, reference) })) };
}
