import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler);
    return () => handlers.delete(name);
  },
}));
const runTranscription = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => [] }));
// live chunks go through the one transcription entry
vi.mock('@services/unifiedAIService', () => ({ transcribeAudio: runTranscription }));

import { chunkEntries, liveTranscript, liveTranscriptResult, shedBacklog, spliceSeam, suppressEcho, type LiveEntry } from '@features/recording/live/liveTranscript';
import { useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';

const read = () => ({ settings: {} as never, providers: [] });
const chunk = (source: string, startMs: number, endMs: number, overlapMs = 0, seq = 0) => ({ source, startMs, endMs, overlapMs, pcm: btoa('\0\0\0\0'), seq });
const sent = (microphone: number, system = 0) => ({ payload: { microphone, system } });
const entry = (source: LiveEntry['source'], startMs: number, endMs: number, text: string, timed = false): LiveEntry => ({ source, startMs, endMs, text, timed });

beforeEach(() => {
  handlers.clear();
  runTranscription.mockReset();
});

describe('in-call transcript', () => {
  it('the sound decides first: bleed is dropped, local speech is kept even when its words repeat the other side', () => {
    const entries = [entry('system', 1_000, 4_000, 'Can everyone hear me now'), entry('microphone', 1_200, 4_200, 'can everyone hear me')];
    expect(suppressEcho(entries, () => 'bleed').map((e) => e.source)).toEqual(['system']);
    expect(suppressEcho(entries, () => 'local')).toHaveLength(2);
  });

  it('when the sound cannot tell, the words decide (fuzzily, within the echo window)', () => {
    const entries = [entry('system', 1_000, 4_000, 'Can everyone hear me now'), entry('microphone', 1_200, 4_200, 'can everyone here me'), entry('microphone', 9_000, 10_000, 'Yes, loud and clear')];
    expect(suppressEcho(entries, () => null).map((e) => e.text)).toEqual(['Can everyone hear me now', 'Yes, loud and clear']);
  });

  it('a sentence the sound shows is local survives the echo next to it in one utterance', () => {
    const entries = [entry('microphone', 1_000, 2_000, 'hear me now'), entry('microphone', 2_300, 5_000, 'I can hear you fine thanks')];
    const signal = (start: number) => (start === 2_300 ? 'local' : 'bleed');
    expect(suppressEcho(entries, signal).map((e) => e.text)).toEqual(['I can hear you fine thanks']);
  });

  it('uses the model\'s own times on the recording\'s timeline when it gives them, else one plain line for the chunk', () => {
    const timed = chunkEntries({ source: 'system', startMs: 60_000, endMs: 66_000 }, {
      text: 'Hi there. How are you?',
      segments: [{ text: 'Hi there.', startSecond: 0.4, endSecond: 1.2 }, { text: 'How are you?', startSecond: 2, endSecond: 3.1 }],
    });
    expect(timed).toEqual([entry('system', 60_400, 61_200, 'Hi there.', true), entry('system', 62_000, 63_100, 'How are you?', true)]);
    expect(chunkEntries({ source: 'microphone', startMs: 0, endMs: 6_000 }, { text: ' Yes. ', segments: [] })).toEqual([entry('microphone', 0, 6_000, 'Yes.')]);
    expect(chunkEntries({ source: 'microphone', startMs: 0, endMs: 6_000 }, { text: '', segments: [] })).toEqual([]);
  });

  it('becomes a transcript labelled by who said each line', () => {
    const result = liveTranscriptResult([entry('microphone', 0, 2_000, 'Hi'), entry('system', 2_000, 3_500, 'Hello')]);
    expect(result.segments).toEqual([
      { text: 'Hi', startSecond: 0, endSecond: 2, speaker: 'You' },
      { text: 'Hello', startSecond: 2, endSecond: 3.5, speaker: 'Others' },
    ]);
  });

  it('transcribes chunks in order as they come, and on Stop waits for the last ones', async () => {
    runTranscription.mockResolvedValueOnce({ text: 'First.', segments: [] }).mockResolvedValueOnce({ text: 'Second.', segments: [] });
    await liveTranscript.start('m1', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('system', 6_000, 12_000) });
    handlers.get('meeting-live://done')?.(sent(1, 1));
    await liveTranscript.finish('m1');
    expect(useMeetingLiveStore.getState()).toMatchObject({ failed: false, entries: [entry('microphone', 0, 6_000, 'First.'), entry('system', 6_000, 12_000, 'Second.')] });
    // the entries stay as the meeting's draft transcript until the next recording
    expect(useMeetingLiveStore.getState()).toMatchObject({ meetingId: 'm1', live: false, pending: 0 });
  });

  it('splices a hard cut\'s re-heard start at the seam, tolerating a slightly different hearing', () => {
    expect(spliceSeam('we will ship the beta on Friday if QA', 'on Friday, if QA signs off by Thursday.')).toBe('signs off by Thursday.');
    expect(spliceSeam('and then the', 'uh then the budget review')).toBe('budget review');
    expect(spliceSeam('nothing in common', 'fresh start here')).toBe('fresh start here');
  });

  it('a chunk with overlap loses only the words its source already has', async () => {
    runTranscription.mockResolvedValueOnce({ text: 'we ship on Friday if QA', segments: [] })
      .mockResolvedValueOnce({ text: 'Friday if QA signs off', segments: [] });
    await liveTranscript.start('m3', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 10_000) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 8_000, 14_000, 2_000, 1) });
    handlers.get('meeting-live://done')?.(sent(2));
    await liveTranscript.finish('m3');
    expect(useMeetingLiveStore.getState().entries.map((e) => e.text)).toEqual(['we ship on Friday if QA', 'signs off']);
  });

  it('falling behind sheds a source\'s oldest waiting chunks beyond two minutes, and only that source\'s', () => {
    const waiting = [...Array.from({ length: 14 }, (_, i) => chunk('microphone', i * 10_000, (i + 1) * 10_000)), chunk('system', 0, 10_000)];
    const { kept, shed } = shedBacklog(waiting as never);
    expect(shed).toBe(2);
    expect(kept.filter((c) => c.source === 'microphone')[0].startMs).toBe(20_000);
    expect(kept.filter((c) => c.source === 'system')).toHaveLength(1);
  });

  it('a chunk that fails marks the live transcript incomplete, and says why', async () => {
    runTranscription.mockRejectedValueOnce(new Error('rate limited'));
    await liveTranscript.start('m2', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    handlers.get('meeting-live://done')?.(sent(1));
    await liveTranscript.finish('m2');
    expect(useMeetingLiveStore.getState().failed).toBe(true);
    expect(useMeetingLiveStore.getState()).toMatchObject({ failed: true, reason: 'rate limited' });
  });

  it('a chunk number skipped (never received) marks the transcript incomplete', async () => {
    runTranscription.mockResolvedValue({ text: 'Hi.', segments: [] });
    await liveTranscript.start('m4', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000, 0, 0) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 12_000, 18_000, 0, 2) });
    handlers.get('meeting-live://done')?.(sent(3));
    await liveTranscript.finish('m4');
    expect(useMeetingLiveStore.getState().failed).toBe(true);
  });

  it('a last chunk lost before the end marks the transcript incomplete', async () => {
    runTranscription.mockResolvedValue({ text: 'Hi.', segments: [] });
    await liveTranscript.start('m5', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    handlers.get('meeting-live://done')?.(sent(2));
    await liveTranscript.finish('m5');
    expect(useMeetingLiveStore.getState().failed).toBe(true);
  });

  it('an end that never comes stops the wait at the deadline, and the recording is transcribed instead', async () => {
    vi.useFakeTimers();
    try {
      runTranscription.mockResolvedValue({ text: 'Hi.', segments: [] });
      await liveTranscript.start('m6', read);
      handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
      const finishing = liveTranscript.finish('m6');
      await vi.advanceTimersByTimeAsync(15_000);
      await finishing;
      expect(useMeetingLiveStore.getState().failed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a recording without a session has nothing to give', async () => {
    await expect(liveTranscript.finish('unknown')).resolves.toBeUndefined();
  });
});
