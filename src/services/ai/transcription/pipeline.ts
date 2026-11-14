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
import { mergeTokenUsage } from '@services/ai/types';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { ADAPTERS } from './adapters';
import { adapterFor } from './catalog';
import { resolveSpeechModel } from './cred';
import { defaultHexModel } from './hex';
import { getSpeechSegments } from './vad';
import type { TokenUsage } from '@services/ai/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type {
  PartRequest,
  SpeechRange,
  SpeechSelection,
  TranscribePart,
  TranscriptionProgress,
  TranscriptResult,
  TranscriptSegment,
} from './types';

export interface TranscribeOptions {
  signal?: AbortSignal;
  /** Called before each part (long audio is sent in parts). */
  onProgress?: (progress: TranscriptionProgress) => void;
  /** Speech detection; defaults to the Silero VAD worker. Injected in tests. */
  vad?: (samples: Float32Array, sampleRate: number) => Promise<SpeechRange[]>;
  /** One-part transcription; defaults to the provider's adapter. Injected in tests. */
  transcribePart?: TranscribePart;
}

const { sampleRate, hexProvider, keylessProviders } = TRANSCRIPTION_CONFIG;

async function modelOf(selection: SpeechSelection): Promise<string> {
  if (selection.model) return selection.model;
  if (selection.provider === hexProvider) return defaultHexModel();
  throw new Error('Choose a transcription model in Settings › Capabilities.');
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

/**
 * Speech chunks of the recording. VAD gate: only speech reaches the model —
 * silence used to be transcribed into hallucinations (".", "Thank you.") that
 * polluted summaries. A VAD failure transcribes the full audio, never a new error.
 */
async function speechChunks(
  samples: Float32Array,
  maxPartSamples: number,
  vad: TranscribeOptions['vad'],
): Promise<Chunk[]> {
  try {
    // The service transfers (neuters) its input; the copy keeps this buffer intact.
    const ranges = await (vad ?? getSpeechSegments)(samples.slice(), sampleRate);
    return toChunks(ranges, samples, sampleRate, maxPartSamples);
  } catch (error: unknown) {
    console.error('[Transcription] VAD failed, transcribing full audio:', error);
    return splitSamples(samples, maxPartSamples).map((part, index) => ({
      samples: part,
      startSecond: (index * maxPartSamples) / sampleRate,
    }));
  }
}

/** Every chunk through the adapter, in order, joined into one result with usage summed across parts. */
async function transcribeChunks(
  chunks: Chunk[],
  transcribe: TranscribePart,
  request: Omit<PartRequest, 'wav'>,
  onProgress: TranscribeOptions['onProgress'],
): Promise<TranscriptResult> {
  const texts: string[] = [];
  const segments: TranscriptSegment[] = [];
  let adapterTimed = false;
  let usage: TokenUsage | undefined;

  for (const [index, chunk] of chunks.entries()) {
    request.signal?.throwIfAborted();
    onProgress?.({ current: index + 1, total: chunks.length });
    const result = await transcribe({ ...request, wav: encodeWavInt16(chunk.samples, sampleRate) });
    if (result.usage) usage = mergeTokenUsage(usage, result.usage);
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
  return { text: texts.join('\n\n'), segments: timed ? segments : [], usage };
}

export async function runTranscription(
  audio: Blob,
  selection: SpeechSelection,
  providers: ModelProvider[],
  { signal, onProgress, vad, transcribePart }: TranscribeOptions = {},
): Promise<TranscriptResult> {
  const adapterId = adapterFor(selection, providers);
  if (!adapterId) {
    throw new Error(`${getProviderTitle(selection.provider)} "${selection.model}" can't transcribe audio. Choose a speech model in Settings › Capabilities.`);
  }
  const model = await modelOf(selection);
  const resolved = keylessProviders.includes(selection.provider) ? null : resolveSpeechModel(selection.provider, model, providers);

  const samples = await toMonoSamples(audio, sampleRate);
  const chunks = await speechChunks(samples, TRANSCRIPTION_CONFIG.partSeconds[adapterId] * sampleRate, vad);
  if (chunks.length === 0) return { text: '', segments: [] };

  return transcribeChunks(chunks, transcribePart ?? ADAPTERS[adapterId], { model, resolved, signal }, onProgress);
}
