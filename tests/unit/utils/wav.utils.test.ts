import { describe, it, expect } from 'vitest';
import { readWavMono, encodeWavInt16, splitSamples } from '@shared/utils/wav.utils';

/** Float32 WAV like the Rust recorder writes (audio/tracks.rs: 32-bit float). */
function floatWav(frames: number[][], sampleRate: number): Uint8Array {
  const channels = frames[0].length;
  const dataBytes = frames.length * channels * 4;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const text = (o: number, t: string) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true); view.setUint16(34, 32, true);
  text(36, 'data'); view.setUint32(40, dataBytes, true);
  frames.flat().forEach((s, i) => view.setFloat32(44 + i * 4, s, true));
  return new Uint8Array(view.buffer);
}

describe('readWavMono', () => {
  it('parses float32 mono at its rate', () => {
    const wav = readWavMono(floatWav([[0.5], [-0.25]], 16000));
    expect(wav?.sampleRate).toBe(16000);
    expect(Array.from(wav!.samples)).toEqual([0.5, -0.25]);
  });

  it('averages channels to mono', () => {
    const wav = readWavMono(floatWav([[1, 0], [0.5, 0.5]], 48000));
    expect(Array.from(wav!.samples)).toEqual([0.5, 0.5]);
  });

  it('round-trips its own int16 output', () => {
    const wav = readWavMono(encodeWavInt16(new Float32Array([0, 0.5, -0.5]), 16000));
    expect(wav?.sampleRate).toBe(16000);
    expect(Array.from(wav!.samples).map((s) => Math.round(s * 100) / 100)).toEqual([0, 0.5, -0.5]);
  });

  it('returns null for non-WAV bytes', () => {
    expect(readWavMono(new TextEncoder().encode('ID3 not a wav file at all, mp3'))).toBeNull();
  });
});

describe('encodeWavInt16', () => {
  it('writes a 44-byte header plus 2 bytes per sample and clamps', () => {
    const bytes = encodeWavInt16(new Float32Array([2, -2]), 16000);
    const view = new DataView(bytes.buffer);
    expect(bytes.length).toBe(48);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x7fff);
  });
});

describe('splitSamples', () => {
  it('splits into parts of at most maxSamples, keeping every sample', () => {
    const parts = splitSamples(new Float32Array(10), 4);
    expect(parts.map((p) => p.length)).toEqual([4, 4, 2]);
  });
});
