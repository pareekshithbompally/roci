import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
const rag = vi.hoisted(() => ({ appendTranscript: vi.fn(), searchWithin: vi.fn() }));
vi.mock('@services/ai/liveNotes', () => ({ refreshLiveNotes: refresh }));
vi.mock('@extensions/rag', () => ({ indexStretch: rag.appendTranscript, searchMeetingWithin: rag.searchWithin }));

import { liveNotes } from '@features/recording/notes/liveNotesStore';
import type { LiveEntry } from '@features/recording/live/liveTranscript';

const entry = (startMs: number, text: string): LiveEntry => ({ source: 'system', startMs, endMs: startMs + 20_000, text, timed: true });
const model = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  refresh.mockResolvedValue({ filled: [], points: [] });
  rag.appendTranscript.mockImplementation(async (_id: string, text: string) => [text]);
  rag.searchWithin.mockImplementation(async (_id: string, queries: string[]) => queries.map(() => [{ chunkText: '[00:00] Others: the budget is ten thousand' }]));
});

describe('an update in flight when the recording ends', () => {
  it('is dropped: nothing applies and its stretch is not indexed after the meeting\'s final index', async () => {
    let answer: (reply: unknown) => void = () => undefined;
    refresh.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    liveNotes.start('m-stop');
    const running = liveNotes.refresh([entry(0, 'we ship friday')], model);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    liveNotes.stop();
    answer({ filled: [], points: [{ text: 'Ship Friday' }] });
    await running;
    expect(rag.appendTranscript).not.toHaveBeenCalled();
  });
});

describe('live notes recall earlier talk from the meeting index', () => {
  it('indexes each applied stretch after its update, and a later note brings it back as earlier talk', async () => {
    liveNotes.start('m-recall');
    const first = [entry(0, 'the budget is ten thousand')];
    await liveNotes.refresh(first, model);
    expect(rag.searchWithin).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(rag.appendTranscript).toHaveBeenCalledWith('m-recall', '[00:00] Others: the budget is ten thousand'));

    liveNotes.type('budget?', { atMs: 60_000, typedAt: 60_000 });
    await liveNotes.refresh([...first, entry(40_000, 'moving on to hiring')], model);
    expect(rag.searchWithin).toHaveBeenCalledWith('m-recall', ['budget?', '[00:40] Others: moving on to hiring'], expect.any(Number));
    expect(refresh.mock.calls[1][0].input.earlier).toEqual(['[00:00] Others: the budget is ten thousand']);
  });
});

describe('an update asked for while one runs', () => {
  it('waits instead of cancelling it, then runs once with everything new', async () => {
    let answer: (reply: unknown) => void = () => undefined;
    refresh.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    liveNotes.start('m-coalesce');
    const first = [entry(0, 'we ship friday')];
    const running = liveNotes.refresh(first, model);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    await liveNotes.refresh([...first, entry(20_000, 'budget is approved')], model);
    await liveNotes.refresh([...first, entry(20_000, 'budget is approved'), entry(40_000, 'hiring paused')], model);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0].signal.aborted).toBe(false);

    answer({ filled: [], points: [{ text: 'Ship Friday' }] });
    await running;
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(refresh.mock.calls[1][0].input.transcript).toContain('hiring paused');
    expect(refresh.mock.calls[1][0].input.transcript).not.toContain('we ship friday');
  });

  it('is dropped when the running one already covered everything', async () => {
    let answer: (reply: unknown) => void = () => undefined;
    refresh.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    liveNotes.start('m-covered');
    const first = [entry(0, 'we ship friday')];
    const running = liveNotes.refresh(first, model);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    await liveNotes.refresh(first, model, [], true);
    answer({ filled: [], points: [] });
    await running;
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
