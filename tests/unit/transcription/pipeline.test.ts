import { describe, it, expect, vi } from 'vitest';
import { runTranscription } from '@services/ai/transcription/pipeline';
import { encodeWavInt16 } from '@shared/utils/wav.utils';
import type { SpeechRange, TranscriptResult } from '@services/ai/transcription/types';

const SAMPLE_RATE = 16_000;

/** Mono: 1 s of loud sine (speech stand-in), then digital silence (3 s total by default). */
function mixedAudio(seconds = 3): Blob {
  const samples = new Float32Array(SAMPLE_RATE * seconds);
  for (let i = 0; i < SAMPLE_RATE; i++) {
    samples[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
  }
  const bytes = encodeWavInt16(samples, SAMPLE_RATE);
  // jsdom's Blob has no arrayBuffer(): serve the exact encoded bytes.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
  (blob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
    bytes.buffer as ArrayBuffer;
  return blob;
}

const selection = { provider: 'hex', model: 'test-model' };

function stubPart(text = 'hello', calls: Uint8Array[] = []) {
  return {
    calls,
    fn: vi.fn(async ({ wav }: { wav: Uint8Array }) => {
      calls.push(wav);
      const result: TranscriptResult = { text, segments: [] };
      return result;
    }),
  };
}

describe('runTranscription VAD gate', () => {
  it('never calls the adapter and returns empty when VAD finds no speech', async () => {
    const part = stubPart();
    const vad = vi.fn(async (): Promise<SpeechRange[]> => []);
    const result = await runTranscription(mixedAudio(), selection, [], {
      vad,
      transcribePart: part.fn,
    });
    expect(vad).toHaveBeenCalledOnce();
    expect(part.fn).not.toHaveBeenCalled();
    expect(result).toEqual({ text: '', segments: [] });
  });

  it('transcribes only speech ranges with recording-clock offsets', async () => {
    const part = stubPart();
    const calls: Uint8Array[] = [];
    const timed = vi.fn(async ({ wav }: { wav: Uint8Array }) => {
      calls.push(wav);
      const result: TranscriptResult = {
        text: 'hi',
        segments: [{ text: 'hi', startSecond: 0, endSecond: 0.5 }],
      };
      return result;
    });
    void part;
    // Speech covers second 1..2 of the 3 s recording. Ranges below the
    // 1.5 s minimum are symmetrically extended: 0.75 s..2.25 s here.
    const vad = vi.fn(async (): Promise<SpeechRange[]> => [
      { startSample: SAMPLE_RATE, endSample: SAMPLE_RATE * 2 },
    ]);
    const result = await runTranscription(mixedAudio(), selection, [], {
      vad,
      transcribePart: timed,
    });
    expect(timed).toHaveBeenCalledOnce();
    // 1.5 s of 16 kHz 16-bit mono + 44-byte WAV header.
    expect(calls[0].length).toBe(44 + Math.ceil(SAMPLE_RATE * 1.5) * 2);
    expect(result.segments).toEqual([
      { text: 'hi', startSecond: 0.75, endSecond: 1.25 },
    ]);
  });

  it('falls back to full-audio transcription when VAD fails', async () => {
    const part = stubPart();
    const vad = vi.fn(async (): Promise<SpeechRange[]> => {
      throw new Error('wasm unavailable');
    });
    const result = await runTranscription(mixedAudio(), selection, [], {
      vad,
      transcribePart: part.fn,
    });
    expect(part.fn).toHaveBeenCalledOnce();
    expect(result.text).toBe('hello');
  });
});

describe('runTranscription usage', () => {
  /** Two speech ranges further apart than the merge gap: two parts. */
  const ranges = (): SpeechRange[] => [
    { startSample: 0, endSample: SAMPLE_RATE * 2 },
    { startSample: SAMPLE_RATE * 6, endSample: SAMPLE_RATE * 8 },
  ];

  it('sums token usage across parts', async () => {
    const part = vi.fn(async (): Promise<TranscriptResult> => ({
      text: 'hi',
      segments: [],
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    }));
    const result = await runTranscription(mixedAudio(8), selection, [], { vad: async () => ranges(), transcribePart: part });
    expect(part).toHaveBeenCalledTimes(2);
    expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 4, totalTokens: 24 });
  });

  it('leaves usage undefined when no part reports it', async () => {
    const part = stubPart();
    const result = await runTranscription(mixedAudio(8), selection, [], { vad: async () => ranges(), transcribePart: part.fn });
    expect(result.usage).toBeUndefined();
  });
});
