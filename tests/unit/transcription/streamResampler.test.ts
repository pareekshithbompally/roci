import { describe, it, expect } from 'vitest';
import { streamResampler } from '@shared/utils/wav.utils';

const sine = (n: number, rate: number) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate));

describe('streamResampler', () => {
  it('16 kHz pieces become one seamless 24 kHz stream: the same samples as resampling it whole', () => {
    const audio = sine(16_000, 16_000);
    const whole = streamResampler(16_000, 24_000)(audio);
    const inPieces = streamResampler(16_000, 24_000);
    const pieces = [audio.subarray(0, 333), audio.subarray(333, 5_000), audio.subarray(5_000)].map(inPieces);
    const joined = Float32Array.from(pieces.flatMap((p) => [...p]));
    // the last moment of a piece is sent with the next one
    expect(24_000 - whole.length).toBeLessThanOrEqual(2);
    expect([...joined]).toEqual([...whole]);
  });

  it('keeps the waveform: a 440 Hz tone at 24 kHz', () => {
    const out = streamResampler(16_000, 24_000)(sine(16_000, 16_000));
    const expected = sine(out.length, 24_000);
    out.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThan(0.02));
  });

  it('leaves audio already at the rate untouched', () => {
    const audio = sine(100, 16_000);
    expect(streamResampler(16_000, 16_000)(audio)).toBe(audio);
  });
});
