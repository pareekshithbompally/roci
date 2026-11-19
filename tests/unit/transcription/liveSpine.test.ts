import { describe, expect, it, vi } from 'vitest';
import { canStream } from '@services/ai/transcription/streaming';
import { liveModeOf } from '@services/ai/transcription/live';
import { liveStreams } from '@services/ai/transcription/liveStreams';
import type { LiveStream, SpeechModelOption } from '@services/ai/transcription';

const option = (provider: string, model: string, live: boolean): SpeechModelOption => ({ provider, model, label: model, ready: true, hint: null, live });

describe('liveModeOf — the one answer to "streams or chunks"', () => {
  it('a model that does not stream goes live in chunks', () => {
    expect(liveModeOf(option('hex', 'parakeet', false), [], 1)).toBe('chunks');
    expect(liveModeOf(undefined, [], 1)).toBe('chunks');
  });

  it('the on-device engine streams dictation but chunks a meeting (one stream at a time)', () => {
    const local = option('on-device', 'parakeet-tdt', true);
    expect(liveModeOf(local, [], 1)).toBe('streams');
    expect(liveModeOf(local, [], 2)).toBe('chunks');
  });

  it('cloud models stream by name, per adapter', () => {
    expect(canStream('openai-compatible', 'gpt-4o-transcribe')).toBe(true);
    expect(canStream('openai-compatible', 'whisper-1')).toBe(false);
    expect(canStream('deepgram', 'nova-3')).toBe(true);
    expect(canStream('hex', 'parakeet')).toBe(false);
    expect(canStream(null, 'anything')).toBe(false);
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
