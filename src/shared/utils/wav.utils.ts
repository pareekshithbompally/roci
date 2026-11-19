/** WAV parse/encode/split; recordings parse directly, other audio is decoded by the webview to mono samples. */

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const WAV_HEADER_BYTES = 44;
const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const INT16_SCALE = 0x7fff;

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export interface MonoAudio {
  sampleRate: number;
  samples: Float32Array;
}

function ascii(view: DataView, offset: number): string {
  return String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(offset + i)));
}

/** Offset and size of the first chunk named `id`, or null. */
function findChunk(view: DataView, id: string): { offset: number; size: number } | null {
  for (let offset = RIFF_HEADER_BYTES; offset + CHUNK_HEADER_BYTES <= view.byteLength;) {
    const size = view.getUint32(offset + 4, true);
    if (ascii(view, offset) === id) return { offset: offset + CHUNK_HEADER_BYTES, size };
    offset += CHUNK_HEADER_BYTES + size + (size % 2);
  }
  return null;
}

function readFormat(view: DataView, offset: number): WavFormat {
  return {
    audioFormat: view.getUint16(offset, true),
    channels: view.getUint16(offset + 2, true),
    sampleRate: view.getUint32(offset + 4, true),
    bitsPerSample: view.getUint16(offset + 14, true),
  };
}

function sampleReader(view: DataView, format: WavFormat): ((offset: number) => number) | null {
  if (format.audioFormat === FORMAT_FLOAT && format.bitsPerSample === 32) return (o) => view.getFloat32(o, true);
  if (format.audioFormat === FORMAT_PCM && format.bitsPerSample === 16) return (o) => view.getInt16(o, true) / INT16_SCALE;
  return null;
}

/** Interleaved frames → mono by averaging channels. */
function downmix(view: DataView, data: { offset: number; size: number }, format: WavFormat, read: (o: number) => number): Float32Array {
  const bytesPerSample = format.bitsPerSample / 8;
  const frameBytes = bytesPerSample * format.channels;
  const frames = Math.floor(Math.min(data.size, view.byteLength - data.offset) / frameBytes);
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) sum += read(data.offset + f * frameBytes + c * bytesPerSample);
    mono[f] = sum / format.channels;
  }
  return mono;
}

/** Parse a float32 or int16 PCM WAV into mono samples; null for anything else. */
export function readWavMono(bytes: Uint8Array): MonoAudio | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < RIFF_HEADER_BYTES || ascii(view, 0) !== 'RIFF' || ascii(view, 8) !== 'WAVE') return null;
  const fmt = findChunk(view, 'fmt ');
  const data = findChunk(view, 'data');
  if (!fmt || !data) return null;
  const format = readFormat(view, fmt.offset);
  const read = sampleReader(view, format);
  if (!read || format.channels < 1) return null;
  return { sampleRate: format.sampleRate, samples: downmix(view, data, format, read) };
}

/** Mono samples → 16-bit PCM WAV bytes. */
export function encodeWavInt16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + dataBytes));
  const write = (offset: number, text: string) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES - CHUNK_HEADER_BYTES + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  const wav = new Uint8Array(view.buffer);
  wav.set(samplesToPcm16(samples), WAV_HEADER_BYTES);
  return wav;
}

/** Mono samples → raw 16-bit little-endian PCM (no header): streamed audio, a WAV's data. */
export function samplesToPcm16(samples: Float32Array): Uint8Array {
  const view = new DataView(new ArrayBuffer(samples.length * 2));
  samples.forEach((s, i) => view.setInt16(i * 2, Math.max(-1, Math.min(1, s)) * INT16_SCALE, true));
  return new Uint8Array(view.buffer);
}

/** Raw 16-bit little-endian PCM (no header) → mono samples. */
export function pcm16ToSamples(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: Math.floor(bytes.byteLength / 2) }, (_, i) => view.getInt16(i * 2, true) / INT16_SCALE);
}

/** Consecutive parts of at most `maxSamples` (views, no copy). */
export function splitSamples(samples: Float32Array, maxSamples: number): Float32Array[] {
  const parts: Float32Array[] = [];
  for (let start = 0; start < samples.length; start += maxSamples) {
    parts.push(samples.subarray(start, Math.min(start + maxSamples, samples.length)));
  }
  return parts;
}

async function decodeToMono(bytes: Uint8Array, sampleRate: number): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate });
  try {
    const buffer = await context.decodeAudioData(bytes.slice().buffer);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      buffer.getChannelData(c).forEach((s, i) => { mono[i] += s / buffer.numberOfChannels; });
    }
    return mono;
  } finally {
    void context.close();
  }
}

/** Mono samples at `sampleRate`: a WAV already at that rate is parsed, anything else decoded and resampled. */
export async function toMonoSamples(audio: Blob, sampleRate: number): Promise<Float32Array> {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const wav = readWavMono(bytes);
  if (wav && wav.sampleRate === sampleRate) return wav.samples;
  try {
    return await decodeToMono(bytes, sampleRate);
  } catch (error: unknown) {
    throw new Error(`This audio format can't be converted for local transcription (${audio.type || 'unknown type'}).`, { cause: error });
  }
}
