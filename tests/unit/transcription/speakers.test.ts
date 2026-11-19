import { describe, it, expect } from 'vitest';
import { labelSpeakers } from '@services/ai/transcription/speakers';
import type { TranscriptResult, TranscriptSegment } from '@services/ai/transcription';

const seg = (startSecond: number, endSecond: number, speaker?: string, text = 'words'): TranscriptSegment =>
  ({ text, startSecond, endSecond, ...(speaker && { speaker }) });
const final = (...segments: TranscriptSegment[]): TranscriptResult => ({ text: '', segments });

describe('labelSpeakers', () => {
  const draft = [seg(0, 4, 'You'), seg(4, 10, 'Others'), seg(10, 12, 'You')];

  it('labels each line of the final transcript with the speaker the draft heard over its span', () => {
    const { segments } = labelSpeakers(final(seg(0.5, 3.5), seg(4.2, 9), seg(10.1, 11.8)), draft);
    expect(segments.map((s) => s.speaker)).toEqual(['You', 'Others', 'You']);
  });

  it('a line spanning both sides takes the one heard longest', () => {
    expect(labelSpeakers(final(seg(3, 9)), draft).segments[0].speaker).toBe('Others');
  });

  it('a line the draft heard nothing over keeps its own label; no draft leaves the transcript as it is', () => {
    expect(labelSpeakers(final(seg(20, 25, 'Speaker 1')), draft).segments[0].speaker).toBe('Speaker 1');
    const untouched = final(seg(0, 3));
    expect(labelSpeakers(untouched, [])).toBe(untouched);
  });
});
