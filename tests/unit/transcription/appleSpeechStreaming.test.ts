import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: class {} }));

import { STREAMING } from '@services/ai/transcription/streaming';
import { liveModeOf } from '@services/ai/transcription/live';
import { speechModelOptions } from '@services/ai/transcription/catalog';

const PLUGIN = 'plugin:apple-intelligence|';
const engine = STREAMING['apple-speech']!;
const open = () => engine.open({ model: 'apple-speech', resolved: null, language: 'en' });
const startedIds = () => invoke.mock.calls.filter(([command]) => command === `${PLUGIN}speech_live_start`).map(([, args]) => args.id);

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

describe('Apple Speech streaming engine', () => {
  it('opens a stream by starting a native session under its own id, in the requested language', async () => {
    await open();
    expect(invoke).toHaveBeenCalledWith(`${PLUGIN}speech_live_start`, { id: expect.any(Number), language: 'en' });
  });

  it('feeds raw f32 with the stream id as a header and returns the text so far', async () => {
    const stream = await open();
    const [id] = startedIds();
    invoke.mockResolvedValueOnce({ committed: 'Hello', tentative: ' there' });
    const pcm = new Float32Array([0.1, -0.2, 0.3]);
    await expect(stream.feed(pcm)).resolves.toEqual({ committed: 'Hello', tentative: ' there' });
    const [command, body, options] = invoke.mock.calls.at(-1)!;
    expect(command).toBe(`${PLUGIN}speech_live_feed`);
    expect(body).toBeInstanceOf(Uint8Array);
    expect((body as Uint8Array).byteLength).toBe(pcm.byteLength);
    expect(options).toEqual({ headers: { 'x-stream': String(id) } });
  });

  it('two opens run as two sessions with different ids (a meeting: you and the call)', async () => {
    await open();
    await open();
    const [first, second] = startedIds();
    expect(first).not.toBe(second);
    expect(engine.concurrent).toBeGreaterThanOrEqual(2);
  });

  it('finish and cancel end their own session', async () => {
    const stream = await open();
    const [id] = startedIds();
    invoke.mockResolvedValueOnce('Hello there');
    await expect(stream.finish()).resolves.toBe('Hello there');
    expect(invoke).toHaveBeenCalledWith(`${PLUGIN}speech_live_finish`, { id });
    await stream.cancel();
    expect(invoke).toHaveBeenCalledWith(`${PLUGIN}speech_live_cancel`, { id });
  });

  it('a denied Speech Recognition is a readable error, not a crash', async () => {
    invoke.mockRejectedValueOnce({ code: 'not-authorized' });
    await expect(open()).rejects.toThrow('Speech Recognition is off for Roci');
  });

  it('Apple Speech is offered live and streams a meeting', () => {
    const status = { available: true, authorization: 'authorized' as const, installed: true };
    const option = speechModelOptions([], { appleSpeech: { status } }).find((o) => o.provider === 'apple-intelligence');
    expect(option?.live).toBe(true);
    expect(liveModeOf(option, [], 2)).toBe('streams');
  });
});
