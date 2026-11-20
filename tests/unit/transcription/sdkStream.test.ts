import { describe, it, expect, vi } from 'vitest';

const parts = vi.hoisted(() => ({ list: [] as object[], hold: Promise.resolve(), refused: null as Error | null }));
vi.mock('ai', () => ({
  experimental_streamTranscribe: () => ({
    // the SDK settles warnings when the stream starts, and rejects them when the model can't stream
    warnings: parts.refused ? Promise.reject(parts.refused) : Promise.resolve([]),
    fullStream: (async function* () {
      for (const part of parts.list) {
        // a 'hold' part: the speech goes on, nothing more arrives until released
        if ('hold' in part) await parts.hold;
        else yield part;
      }
    })(),
  }),
}));
vi.mock('@services/ai/provider', () => ({ createTranscriptionModel: () => ({}) }));

import { sdkStreaming } from '@services/ai/transcription/sdkStream';
import { liveStreams, type StreamLine } from '@services/ai/transcription/liveStreams';

const open = (list: object[]) => {
  parts.list = list;
  return sdkStreaming('openai-compatible').open({ model: 'm', resolved: {} as never, language: 'en' });
};
const run = async (list: object[]) => (await open(list)).finish();

describe('cloud stream reader', () => {
  it('a model that cannot stream refuses at open, so the caller goes live in chunks', async () => {
    parts.refused = new Error('streaming transcription with whisper-1');
    await expect(open([])).rejects.toThrow('streaming transcription with whisper-1');
    parts.refused = null;
  });

  it('words that come as deltas (OpenAI) show while spoken, and the stretch settles once with its final text', async () => {
    let release = () => {};
    parts.hold = new Promise((resolve) => { release = resolve; });
    const stream = await open([
      { type: 'transcript-delta', id: 'i1', delta: 'Ship the' },
      { type: 'transcript-delta', id: 'i1', delta: ' beta Friday.' },
      { hold: true },
      { type: 'transcript-final', id: 'i1', text: 'Ship the beta Friday.' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // mid-speech: the words are already showing, not yet settled
    expect(await stream.feed(new Float32Array(160))).toEqual({ committed: '', tentative: 'Ship the beta Friday.' });
    release();
    expect(await stream.finish()).toBe('Ship the beta Friday.');
  });

  it('engines that revise partials settle only their finals', async () => {
    const text = await run([
      { type: 'transcript-partial', text: 'ship the' },
      { type: 'transcript-final', text: 'Ship the beta.' },
      { type: 'transcript-final', text: 'Budget is 20k.' },
    ]);
    expect(text).toBe('Ship the beta. Budget is 20k.');
  });

  it('a dictation of deltas becomes its final text once: no repeat, no words split, no space before a comma', async () => {
    parts.list = [
      { type: 'transcript-delta', id: 'i1', delta: ' Who are you?' },
      { type: 'transcript-delta', id: 'i1', delta: ' Help me under' },
      { type: 'transcript-delta', id: 'i1', delta: 'stand, please.' },
      { type: 'transcript-final', id: 'i1', text: 'Who are you? Help me understand, please.' },
    ];
    const lines: StreamLine<'mic'>[] = [];
    const engine = sdkStreaming('openai-compatible');
    const session = liveStreams<'mic'>(() => engine.open({ model: 'm', resolved: {} as never, language: 'en' }), {
      line: (line) => lines.push(line),
      partial: () => undefined,
      fail: (reason) => { throw new Error(reason); },
    });
    session.feed({ source: 'mic', startMs: 0, endMs: 100 }, new Float32Array(160));
    await session.finish();
    expect(lines.map((l) => l.text)).toEqual(['Who are you? Help me understand, please.']);
  });
});
