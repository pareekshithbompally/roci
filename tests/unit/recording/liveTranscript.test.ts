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
vi.mock('@services/unifiedAIService', () => ({ transcribeAudio: runTranscription, readySpeechSelection: () => ({ provider: 'deepgram', model: 'nova-3' }) }));
const tried = vi.hoisted(() => ({ streams: null as object[] | null }));
vi.mock('@services/ai/transcription', async (original) => ({
  ...(await original<typeof import('@services/ai/transcription')>()),
  tryLiveStreams: async () => tried.streams,
}));

import { liveTranscript, liveTranscriptResult, shedBacklog, suppressEcho, type LiveEntry } from '@features/recording/live/liveTranscript';
import { useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';

const read = () => ({ settings: {} as never, providers: [] });
const chunk = (source: string, startMs: number, endMs: number, overlapMs = 0, seq = 0) => ({ source, startMs, endMs, overlapMs, tailMs: 0, pcm: btoa('\0\0\0\0'), seq });
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

  it('becomes a transcript labelled by who said each line', () => {
    const result = liveTranscriptResult([entry('microphone', 0, 2_000, 'Hi'), entry('system', 2_000, 3_500, 'Hello')]);
    expect(result.segments).toEqual([
      { text: 'Hi', startSecond: 0, endSecond: 2, speaker: 'You' },
      { text: 'Hello', startSecond: 2, endSecond: 3.5, speaker: 'Others' },
    ]);
  });

  it('starting the same recording again (live transcription off and on) keeps its draft', async () => {
    runTranscription.mockResolvedValueOnce({ text: 'First.', segments: [] });
    await liveTranscript.start('m-again', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    await vi.waitFor(() => expect(useMeetingLiveStore.getState().entries).toHaveLength(1));
    await liveTranscript.start('m-again', read);
    expect(useMeetingLiveStore.getState().entries).toEqual([entry('microphone', 0, 6_000, 'First.')]);
    await liveTranscript.finish('m-again');
  });

  it('transcribes each chunk whole, in order as they come; Stop keeps the draft on screen', async () => {
    runTranscription.mockResolvedValueOnce({ text: 'First.', segments: [] }).mockResolvedValueOnce({ text: 'Second.', segments: [] });
    await liveTranscript.start('m1', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('system', 6_000, 12_000, 0, 0) });
    await vi.waitFor(() => expect(useMeetingLiveStore.getState().entries).toHaveLength(2));
    expect(runTranscription.mock.calls[0][3]).toMatchObject({ whole: true, silence: 'empty' });
    await liveTranscript.finish('m1');
    expect(useMeetingLiveStore.getState()).toMatchObject({
      meetingId: 'm1', live: false, reason: '', entries: [entry('microphone', 0, 6_000, 'First.'), entry('system', 6_000, 12_000, 'Second.')],
    });
  });

  it('falling behind sheds a source\'s oldest waiting chunks beyond two minutes, and only that source\'s', () => {
    const waiting = [...Array.from({ length: 14 }, (_, i) => chunk('microphone', i * 10_000, (i + 1) * 10_000)), chunk('system', 0, 10_000)];
    const { kept, shed } = shedBacklog(waiting as never);
    expect(shed).toBe(2);
    expect(kept.filter((c) => c.source === 'microphone')[0].startMs).toBe(20_000);
    expect(kept.filter((c) => c.source === 'system')).toHaveLength(1);
  });

  it('a chunk that fails marks the draft as having a gap, and says why', async () => {
    runTranscription.mockRejectedValueOnce(new Error('rate limited'));
    await liveTranscript.start('m2', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000) });
    await vi.waitFor(() => expect(useMeetingLiveStore.getState()).toMatchObject({ reason: 'rate limited' }));
  });

  it('a window reloaded mid-recording joins the recorder\'s count: its first chunk is no gap', async () => {
    runTranscription.mockResolvedValue({ text: 'Joined.', segments: [] });
    await liveTranscript.start('m-joined', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 30_000, 36_000, 0, 5) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 36_000, 42_000, 0, 6) });
    await vi.waitFor(() => expect(useMeetingLiveStore.getState().entries).toHaveLength(2));
    expect(useMeetingLiveStore.getState().reason).toBe('');
    // it missed the start, so it never stands as the transcript
    expect(await liveTranscript.finish('m-joined')).toMatchObject({ complete: false });
  });

  it('a window reloaded mid-recording shows the lines it had and carries on; the draft is not whole', async () => {
    // what the window had before the reload, kept in its session storage
    useMeetingLiveStore.setState({ meetingId: 'm-reload', entries: [entry('microphone', 0, 6_000, 'Before.')] });
    expect(JSON.parse(sessionStorage.getItem('roci-meeting-live') ?? '{}').state.entries).toHaveLength(1);
    runTranscription.mockResolvedValue({ text: 'After.', segments: [] });
    await liveTranscript.start('m-reload', read);
    expect(useMeetingLiveStore.getState().entries).toEqual([entry('microphone', 0, 6_000, 'Before.')]);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 12_000, 18_000, 0, 2) });
    const draft = await liveTranscript.finish('m-reload');
    expect(draft).toEqual({ complete: false, entries: [entry('microphone', 0, 6_000, 'Before.'), entry('microphone', 12_000, 18_000, 'After.')] });
  });

  it('a new recording starts empty, whatever the window kept from the last one', async () => {
    useMeetingLiveStore.setState({ meetingId: 'old', entries: [entry('microphone', 0, 6_000, 'Old.')] });
    await liveTranscript.start('m-new', read);
    expect(useMeetingLiveStore.getState().entries).toEqual([]);
    await liveTranscript.finish('m-new');
  });

  it('a chunk number skipped (never received) marks the draft as having a gap', async () => {
    runTranscription.mockResolvedValue({ text: 'Hi.', segments: [] });
    await liveTranscript.start('m4', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000, 0, 0) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 12_000, 18_000, 0, 2) });
    expect(await liveTranscript.finish('m4')).toMatchObject({ complete: false });
  });

  it('Stop waits for the chunks still queued, then hands over the whole draft', async () => {
    runTranscription.mockResolvedValueOnce({ text: 'First.', segments: [] }).mockResolvedValueOnce({ text: 'Last.', segments: [] });
    await liveTranscript.start('m6', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000, 0, 0) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 6_000, 9_000, 0, 1) });
    const draft = await liveTranscript.finish('m6');
    expect(draft).toEqual({ complete: true, entries: [entry('microphone', 0, 6_000, 'First.'), entry('microphone', 6_000, 9_000, 'Last.')] });
    expect(liveTranscript.active('m6')).toBe(false);
    expect(useMeetingLiveStore.getState()).toMatchObject({ live: false, entries: draft?.entries });
  });

  it('cancelling the wait stops the chunk in flight and drops the queue; the draft is not whole', async () => {
    let cancelled = false;
    runTranscription.mockImplementation((_wav: Blob, _s: unknown, _p: unknown, { signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(new Error('aborted')); })));
    await liveTranscript.start('m9', read);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 6_000, 0, 0) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 6_000, 12_000, 0, 1) });
    const cancel = new AbortController();
    const finishing = liveTranscript.finish('m9', cancel.signal);
    cancel.abort();
    expect(await finishing).toMatchObject({ complete: false });
    expect(cancelled).toBe(true);
    expect(runTranscription).toHaveBeenCalledTimes(1);
  });

  it('stopping a meeting never touches the next recording\'s session', async () => {
    await liveTranscript.start('m7', read);
    await liveTranscript.start('m8', read);
    expect(await liveTranscript.finish('m7')).toBeNull();
    expect(liveTranscript.active('m8')).toBe(true);
    expect(useMeetingLiveStore.getState()).toMatchObject({ meetingId: 'm8', live: true });
  });

  it('Record tries real-time for each side: taken → frames, and each side\'s first frame uses its stream', async () => {
    const lines: string[] = [];
    const sideStream = (word: string) => ({ feed: async () => ({ committed: word, tentative: '' }), finish: async () => word, cancel: vi.fn(async () => undefined) });
    tried.streams = [sideStream('Mine.'), sideStream('Theirs.')];
    expect(await liveTranscript.prepare(read, ['microphone', 'system'])).toBe(true);
    await liveTranscript.start('m-stream', read, true);
    handlers.get('meeting-live://chunk')?.({ payload: chunk('microphone', 0, 250, 0, 0) });
    handlers.get('meeting-live://chunk')?.({ payload: chunk('system', 0, 250, 0, 0) });
    const draft = await liveTranscript.finish('m-stream');
    lines.push(...(draft?.entries.map((e) => `${e.source}: ${e.text}`) ?? []));
    expect(lines.sort()).toEqual(['microphone: Mine.', 'system: Theirs.']);
    tried.streams = null;
  });

  it('Record with a model that refuses real-time keeps nothing open (the recorder sends chunks)', async () => {
    tried.streams = null;
    expect(await liveTranscript.prepare(read, ['microphone', 'system'])).toBe(false);
  });

  it('a side that never sent audio has its stream closed at Stop; a failed Record closes them all', async () => {
    const unused = { feed: vi.fn(), finish: vi.fn(), cancel: vi.fn(async () => undefined) };
    tried.streams = [unused, unused];
    await liveTranscript.prepare(read, ['microphone', 'system']);
    liveTranscript.release();
    expect(unused.cancel).toHaveBeenCalledTimes(2);
    tried.streams = null;
  });

  it('a recording without a session has nothing to give', async () => {
    expect(await liveTranscript.finish('unknown')).toBeNull();
  });
});
