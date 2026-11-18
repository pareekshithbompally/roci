import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler);
    return () => handlers.delete(name);
  },
}));
const runTranscription = vi.hoisted(() => vi.fn());
vi.mock('@services/ai/transcription', () => ({
  runTranscription,
  speechSelectionOf: () => ({ provider: 'openai', model: 'whisper-1' }),
}));

import { dropEchoes, liveTranscript, liveTranscriptResult, type LiveEntry } from '@features/recording/live/liveTranscript';
import { useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';

const read = () => ({ settings: {} as never, providers: [] });
const chunk = (source: string, startMs: number, endMs: number) => ({ source, startMs, endMs, pcm: btoa('\0\0\0\0') });
const entry = (source: LiveEntry['source'], startMs: number, endMs: number, text: string): LiveEntry => ({ source, startMs, endMs, text });

beforeEach(() => {
  handlers.clear();
  runTranscription.mockReset();
});

describe('in-call transcript', () => {
  it('drops the microphone\'s echo of what the speakers played, and keeps time order', () => {
    const entries = [
      entry('system', 1_000, 4_000, 'Can everyone hear me now'),
      entry('microphone', 1_200, 4_200, 'can everyone hear me'),
      entry('microphone', 5_000, 6_000, 'Yes, loud and clear'),
    ];
    expect(dropEchoes(entries).map((e) => e.text)).toEqual(['Can everyone hear me now', 'Yes, loud and clear']);
  });

  it('becomes a transcript labelled by who said each line', () => {
    const result = liveTranscriptResult([entry('microphone', 0, 2_000, 'Hi'), entry('system', 2_000, 3_500, 'Hello')]);
    expect(result.segments).toEqual([
      { text: 'Hi', startSecond: 0, endSecond: 2, speaker: 'You' },
      { text: 'Hello', startSecond: 2, endSecond: 3.5, speaker: 'Others' },
    ]);
  });

  it('transcribes chunks in order as they come, and on Stop waits for the last ones', async () => {
    runTranscription.mockResolvedValueOnce({ text: 'First.' }).mockResolvedValueOnce({ text: 'Second.' });
    await liveTranscript.start('m1', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('system', 6_000, 12_000) });
    handlers.get('meeting-live://done')?.({ payload: null });
    const outcome = await liveTranscript.finish('m1');
    expect(outcome).toEqual({ complete: true, entries: [entry('microphone', 0, 6_000, 'First.'), entry('system', 6_000, 12_000, 'Second.')] });
    expect(useMeetingLiveStore.getState().meetingId).toBeNull();
  });

  it('a chunk that fails marks the transcript incomplete, so the recording is transcribed instead', async () => {
    runTranscription.mockRejectedValueOnce(new Error('rate limited'));
    await liveTranscript.start('m2', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    handlers.get('meeting-live://done')?.({ payload: null });
    expect(await liveTranscript.finish('m2')).toMatchObject({ complete: false });
  });

  it('a recording without a session has nothing to give', async () => {
    expect(await liveTranscript.finish('unknown')).toBeNull();
  });
});
