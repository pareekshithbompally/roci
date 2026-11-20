/** Live dictation keeps the clip beside the stream: a stream the model refuses, or that breaks, gives way to the clip. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const tap = vi.hoisted(() => ({ slice: null as ((pcm: Float32Array) => void) | null }));
vi.mock('@services/ai/transcription/pcmTap', () => ({
  tapPcm: async (_stream: MediaStream, onSlice: (pcm: Float32Array) => void) => {
    tap.slice = onSlice;
    return { stop: () => { tap.slice = null; } };
  },
}));

/** A recorder that hands over one piece of audio when it stops. */
class FakeRecorder {
  state = 'inactive';
  mimeType = 'audio/mp4';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['clip']) });
    this.onstop?.();
  }
}
vi.stubGlobal('MediaRecorder', FakeRecorder);

import { liveCapture } from '@services/ai/transcription/capture';
import type { LiveStream } from '@services/ai/transcription';

const mic = {} as MediaStream;
const stream = (finalText: string): LiveStream => ({
  feed: async () => ({ committed: finalText, tentative: '' }),
  finish: async () => finalText,
  cancel: async () => undefined,
});

beforeEach(() => { tap.slice = null; });

describe('live dictation', () => {
  it('a stream that works gives its own words; the clip is not transcribed', async () => {
    const transcribe = vi.fn(async () => 'from the clip');
    const capture = await liveCapture(mic, async () => stream('Ship it Friday.'), vi.fn(), transcribe);
    tap.slice?.(new Float32Array(1_600));
    expect(await capture.finish()).toBe('Ship it Friday.');
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('a stream the model refuses gives way to the clip, so nothing said is lost', async () => {
    const transcribe = vi.fn(async () => 'Ship it Friday.');
    const capture = await liveCapture(mic, () => Promise.reject(new Error("streaming transcription with whisper-1")), vi.fn(), transcribe);
    tap.slice?.(new Float32Array(1_600));
    expect(await capture.finish()).toBe('Ship it Friday.');
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
});
