import { describe, it, expect, vi } from 'vitest';

const parts = vi.hoisted(() => ({ list: [] as object[], hold: Promise.resolve() }));
vi.mock('ai', () => ({
  experimental_streamTranscribe: () => ({
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

const open = (list: object[]) => {
  parts.list = list;
  return sdkStreaming('openai-compatible', () => true).open({ model: 'm', resolved: {} as never, language: 'en' });
};
const run = async (list: object[]) => (await open(list)).finish();

describe('cloud stream reader', () => {
  it('words that come as deltas (OpenAI) are settled as they come, and their final text is not added again', async () => {
    let release = () => {};
    parts.hold = new Promise((resolve) => { release = resolve; });
    const stream = await open([
      { type: 'transcript-delta', id: 'i1', delta: 'Ship the' },
      { type: 'transcript-delta', id: 'i1', delta: ' beta Friday.' },
      { hold: true },
      { type: 'transcript-final', id: 'i1', text: 'Ship the beta Friday.' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // mid-speech: the words are already there
    expect((await stream.feed(new Float32Array(160))).committed).toBe('Ship the beta Friday.');
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
});
