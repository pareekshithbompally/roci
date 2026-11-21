import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { LiveStream } from '@services/ai/transcription';

/** A stand-in on-device engine that runs two streams; the model takes or refuses each one. */
const engine = vi.hoisted(() => ({ refuseAt: -1, opened: 0, cancelled: 0 }));
vi.mock('@services/ai/transcription/streaming', () => ({
  STREAMING: {
    'on-device': {
      concurrent: 2,
      open: async () => {
        if (engine.opened++ === engine.refuseAt) throw new Error("this model can't transcribe live");
        return { feed: vi.fn(), finish: vi.fn(), cancel: async () => { engine.cancelled++; } };
      },
    },
  },
}));

import { runsLive, tryLiveStreams } from '@services/ai/transcription/live';
import { liveStreams } from '@services/ai/transcription/liveStreams';

const local = { provider: 'on-device', model: 'parakeet-tdt' };

beforeEach(() => Object.assign(engine, { refuseAt: -1, opened: 0, cancelled: 0 }));

describe('try real-time, else chunks', () => {
  it('worth trying only when the engine runs a stream per side', () => {
    expect(runsLive(local, [], 2)).toBe(true);
    expect(runsLive(local, [], 3)).toBe(false);
    // no streaming engine (Hex) goes live in chunks
    expect(runsLive({ provider: 'hex', model: 'parakeet' }, [], 1)).toBe(false);
  });

  it('every side taken → the streams; one refused → none kept, the opened ones closed', async () => {
    expect(await tryLiveStreams(local, [], 2)).toHaveLength(2);
    engine.opened = 0;
    engine.refuseAt = 1;
    expect(await tryLiveStreams(local, [], 2)).toBeNull();
    expect(engine.cancelled).toBe(1);
  });

  it('an engine that runs too few streams is not tried at all', async () => {
    expect(await tryLiveStreams(local, [], 3)).toBeNull();
    expect(engine.opened).toBe(0);
  });
});

/** A stream whose settled text grows by the words fed, one word per frame, the last one still being revised. */
function fakeStream(words: string[]): LiveStream {
  let fed = 0;
  return {
    feed: async () => {
      fed += 1;
      return { committed: words.slice(0, fed - 1).join(' '), tentative: words[fed - 1] ?? '' };
    },
    finish: async () => words.join(' '),
    cancel: async () => undefined,
  };
}

const frame = (seq: number) => ({ source: 'microphone' as const, startMs: seq * 250, endMs: (seq + 1) * 250, overlapMs: 0, pcm: '', seq });

describe('liveStreams — a streaming meeting source', () => {
  it('turns newly settled text into lines, shows the rest as draft words, and settles everything at the end', async () => {
    const lines: string[] = [];
    const partials: string[] = [];
    const streams = liveStreams(async () => fakeStream(['Okay', 'lets', 'start']), {
      line: (entry) => lines.push(entry.text),
      partial: (_source, text) => partials.push(text),
      fail: vi.fn(),
    });
    [0, 1, 2].forEach((seq) => streams.feed(frame(seq), new Float32Array(4)));
    await streams.finish();
    expect(lines).toEqual(['Okay', 'lets', 'start']);
    expect(partials).toContain('start');
    expect(partials.at(-1)).toBe('');
  });

  it('a stream that fails mid-meeting takes no more audio and says so once', async () => {
    const fail = vi.fn();
    let fed = 0;
    const breaking: LiveStream = { feed: async () => { fed++; throw new Error('connection lost'); }, finish: async () => '', cancel: async () => undefined };
    const streams = liveStreams(async () => breaking, { line: vi.fn(), partial: vi.fn(), fail });
    [0, 1, 2].forEach((seq) => streams.feed(frame(seq), new Float32Array(4)));
    await streams.finish();
    expect(fed).toBe(1);
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('a stream that cannot open says why, once, and feeds nothing', async () => {
    const fail = vi.fn();
    const streams = liveStreams(() => Promise.reject(new Error('Add your OpenAI API key in Settings › Providers.')), { line: vi.fn(), partial: vi.fn(), fail });
    streams.feed(frame(0), new Float32Array(4));
    streams.feed(frame(1), new Float32Array(4));
    await streams.finish();
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledWith('Add your OpenAI API key in Settings › Providers.');
  });
});
