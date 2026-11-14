/**
 * The one transcription pipeline: every caller (recording, import,
 * re-transcribe, dictation) and every adapter go through it.
 *
 * Audio → 16 kHz mono → parts the adapter accepts → adapter per part, with
 * progress before each part and cancellation between parts → one result with
 * segment times offset to the whole recording.
 */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { encodeWavInt16, splitSamples, toMonoSamples } from '@shared/utils/wav.utils';
import { ADAPTERS } from './adapters';
import { adapterFor, speechCred } from './catalog';
import { defaultHexModel } from './hex';
import { getSpeechSegments } from './vad';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { SpeechRange, SpeechSelection, TranscriptionProgress, TranscriptResult, TranscriptSegment } from './types';

export interface TranscribeOptions {
  signal?: AbortSignal;
  /** Called before each part (long audio is sent in parts). */
  onProgress?: (progress: TranscriptionProgress) => void;
  /** Speech detection; defaults to the Silero VAD worker. Injected in tests. */
  vad?: (samples: Float32Array, sampleRate: number) => Promise<SpeechRange[]>;
  /** One-part transcription; defaults to the provider's adapter. Injected in tests. */
  transcribePart?: typeof ADAPTERS[keyof typeof ADAPTERS];
}

const { sampleRate, hexProvider } = TRANSCRIPTION_CONFIG;

async function modelOf(selection: SpeechSelection): Promise<string> {
  if (selection.model) return selection.model;
  if (selection.provider === hexProvider) return defaultHexModel();
  throw new Error('Choose a transcription model in Settings › Audio.');
}

/** Part segments shifted to the recording's clock; a part without segments becomes one. */
function placeSegments(result: TranscriptResult, startSecond: number, endSecond: number): TranscriptSegment[] {
  if (result.segments.length === 0) return [{ text: result.text, startSecond, endSecond }];
  return result.segments.map((s) => ({ ...s, startSecond: s.startSecond + startSecond, endSecond: s.endSecond + startSecond }));
}

/** Strips the leading "." Whisper-style engines emit for pre-roll silence. */
function cleanText(text: string): string {
  return text.trim().replace(/^\s*\.+\s*/, '').trim();
}

/** One transcription unit: speech samples with its offset on the recording clock. */
interface Chunk {
  samples: Float32Array;
  startSecond: number;
}

/**
 * VAD ranges → transcribable chunks: clamp, drop empties, merge ranges split
 * by short pauses, extend stubs to a minimum length (engines need context),
 * then split anything longer than the adapter accepts.
 */
function toChunks(
  ranges: SpeechRange[],
  samples: Float32Array,
  sampleRate: number,
  maxPartSamples: number,
): Chunk[] {
  const { mergeGapMs, minRangeMs } = TRANSCRIPTION_CONFIG.vad;
  const mergeGap = (mergeGapMs * sampleRate) / 1000;
  const minRange = (minRangeMs * sampleRate) / 1000;

  const sorted = ranges
    .map((r) => ({
      start: Math.max(0, Math.floor(r.startSample)),
      end: Math.min(samples.length, Math.ceil(r.endSample)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start - last.end <= mergeGap) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const chunks: Chunk[] = [];
  for (const range of merged) {
    let { start, end } = range;
    if (end - start < minRange) {
      const pad = Math.ceil((minRange - (end - start)) / 2);
      start = Math.max(0, start - pad);
      end = Math.min(samples.length, end + pad);
    }
    for (let offset = start; offset < end; offset += maxPartSamples) {
      const part = samples.subarray(offset, Math.min(offset + maxPartSamples, end));
      chunks.push({ samples: part, startSecond: offset / sampleRate });
    }
  }
  return chunks;
}

export async function runTranscription(
  audio: Blob,
  selection: SpeechSelection,
  providers: ModelProvider[],
  { signal, onProgress, vad, transcribePart }: TranscribeOptions = {},
): Promise<TranscriptResult> {
  const adapterId = adapterFor(selection.provider);
  if (!adapterId) throw new Error(`"${selection.provider}" can't transcribe audio.`);
  const transcribe = transcribePart ?? ADAPTERS[adapterId];
  const cred = selection.provider === hexProvider ? null : speechCred(selection.provider, providers);
  const model = await modelOf(selection);

  const samples = await toMonoSamples(audio, sampleRate);

  // VAD gate: only speech reaches the model. Silence used to be transcribed
  // into hallucinations (".", "Thank you.") that then polluted summaries.
  // A VAD failure falls back to full-audio transcription — never a new error.
  let ranges: SpeechRange[] | null = null;
  try {
    const detect = vad ?? getSpeechSegments;
    // The service transfers (neuters) its input; the copy keeps this buffer intact.
    ranges = await detect(samples.slice(), sampleRate);
  } catch (error: unknown) {
    console.error('[Transcription] VAD failed, transcribing full audio:', error);
  }
  const maxPartSamples = TRANSCRIPTION_CONFIG.partSeconds[adapterId] * sampleRate;
  const chunks = ranges
    ? toChunks(ranges, samples, sampleRate, maxPartSamples)
    : splitSamples(samples, maxPartSamples).map((part, index) => ({
        samples: part,
        startSecond: (index * maxPartSamples) / sampleRate,
      }));
  if (chunks.length === 0) return { text: '', segments: [] };

  const texts: string[] = [];
  const segments: TranscriptSegment[] = [];
  let adapterTimed = false;

  for (const [index, chunk] of chunks.entries()) {
    signal?.throwIfAborted();
    onProgress?.({ current: index + 1, total: chunks.length });
    const result = await transcribe({ wav: encodeWavInt16(chunk.samples, sampleRate), model, cred, signal });
    const cleaned = cleanText(result.text);
    if (!cleaned) continue;
    texts.push(cleaned);
    adapterTimed ||= result.segments.length > 0;
    const endSecond = chunk.startSecond + chunk.samples.length / sampleRate;
    segments.push(...placeSegments({ ...result, text: cleaned }, chunk.startSecond, endSecond));
  }

  // Keep timestamps when the engine gave them or the audio was split;
  // a single untimed part stays plain text (dictation, short clips).
  const timed = adapterTimed || texts.length > 1;
  return { text: texts.join('\n\n'), segments: timed ? segments : [] };
}
