/** One side's in-call transcript, joined chunk by chunk as the rolling meeting transcript does. */

import { describe, it, expect } from 'vitest';
import { acceptChunk, finishTrack, newTrack } from '@features/recording/live/trackTranscript';
import type { TranscriptSegment } from '@services/ai/transcription';

/** Words of a chunk, timed in seconds from the chunk's start. */
const words = (...timed: [string, number, number][]): TranscriptSegment[] => timed.map(([text, startSecond, endSecond]) => ({ text, startSecond, endSecond }));
const heard = (w: TranscriptSegment[]) => ({ text: w.map((x) => x.text).join(' '), segments: [{ text: 'x', startSecond: 0, endSecond: 1 }], words: w });
const texts = (track: ReturnType<typeof newTrack>) => track.entries.map((e) => e.text);

describe('track transcript', () => {
  it('publishes finished sentences, each timed from its first word', () => {
    const track = newTrack('microphone', []);
    acceptChunk(track, { startMs: 0, endMs: 6_000, overlapMs: 0, tailMs: 0 }, heard(words(['Ship', 1, 1.3], ['it.', 1.3, 1.6], ['Friday', 3, 3.4], ['works.', 3.4, 3.9])));
    expect(track.entries.map((e) => [e.startMs, e.text])).toEqual([[1_000, 'Ship it.'], [3_000, 'Friday works.']]);
  });

  it('a sentence running into the next chunk\'s overlap stays open, then joins at a word both chunks heard — none lost, none repeated', () => {
    const track = newTrack('microphone', []);
    // hard cut at 10 s; the next chunk starts at 8 s and hears 8–10 s again
    acceptChunk(track, { startMs: 0, endMs: 10_000, overlapMs: 0, tailMs: 2_000 }, heard(words(
      ['We', 7, 7.2], ['ship', 7.3, 7.9], ['the', 8.2, 8.5], ['beta', 8.9, 9.3], ['on', 9.5, 9.9],
    )));
    expect(track.entries).toEqual([]);
    acceptChunk(track, { startMs: 8_000, endMs: 14_000, overlapMs: 2_000, tailMs: 0 }, heard(words(
      ['the', 0.2, 0.5], ['beta', 0.9, 1.3], ['on', 1.5, 1.9], ['Friday.', 2.0, 2.6],
    )));
    expect(texts(track)).toEqual(['We ship the beta on Friday.']);
  });

  it('Stop publishes what is still open', () => {
    const track = newTrack('system', []);
    acceptChunk(track, { startMs: 0, endMs: 10_000, overlapMs: 0, tailMs: 2_000 }, heard(words(['Almost', 8.5, 9], ['there', 9.2, 9.8])));
    expect(track.entries).toEqual([]);
    finishTrack(track);
    expect(texts(track)).toEqual(['Almost there']);
  });

  it('a model without word times gives its segments, the overlap\'s repeated words dropped', () => {
    const track = newTrack('microphone', []);
    acceptChunk(track, { startMs: 0, endMs: 10_000, overlapMs: 0, tailMs: 2_000 }, { text: 'we ship on Friday if QA', segments: [] });
    acceptChunk(track, { startMs: 8_000, endMs: 14_000, overlapMs: 2_000, tailMs: 0 }, { text: 'Friday if QA signs off', segments: [] });
    expect(texts(track)).toEqual(['we ship on Friday if QA', 'signs off']);
  });

  it('a reloaded window carries on from the lines it kept', () => {
    const kept = [{ source: 'microphone' as const, startMs: 0, endMs: 4_000, text: 'Before.', timed: true }];
    const track = newTrack('microphone', kept);
    acceptChunk(track, { startMs: 12_000, endMs: 18_000, overlapMs: 0, tailMs: 0 }, heard(words(['After.', 1, 1.5])));
    expect(texts(track)).toEqual(['Before.', 'After.']);
  });
});
