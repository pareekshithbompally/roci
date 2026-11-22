/** The one transcription pipeline: audio → 16 kHz mono parts → adapter per part → one offset-timed result. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { savedTerms } from '@shared/utils/personalization';
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
import type { ResolvedModel } from '@shared/utils/modelResolver';
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
  /** A live meeting chunk: sent whole when it holds speech, not cut into its speech spans. */
  whole?: boolean;
  /** Speech detection; defaults to the bundled speech detector. Injected in tests. */
  vad?: (samples: Float32Array) => Promise<SpeechRange[]>;
  /** One-part transcription; defaults to the provider's adapter. Injected in tests. */
  transcribePart?: TranscribePart;
  /** What the engine was sent and billed for, once the parts stop: all of them, or those before a failure or cancel. */
  onBilled?: (billed: Billed) => void;
}

/** Tokens spent (engines billed by tokens) and audio sent in seconds (engines billed by the minute; skipped silence isn't sent). */
export interface Billed {
  usage?: TokenUsage;
  audioSeconds: number;
}

const { sampleRate, hexProvider, keylessProviders } = TRANSCRIPTION_CONFIG;

/** The model to run (Hex's first downloaded one when none is chosen) and its credentials (none for engines on this Mac). */
export async function speechModelFor(selection: SpeechSelection, providers: ModelProvider[]): Promise<{ model: string; resolved: ResolvedModel | null }> {
  const model = selection.model || (selection.provider === hexProvider ? await defaultHexModel() : '');
  if (!model) throw new Error('Choose a transcription model in Settings › Default Models.');
  const resolved = keylessProviders.includes(selection.provider) ? null : resolveSpeechModel(selection.provider, model, providers);
  return { model, resolved };
}

const shifted = (spans: TranscriptSegment[], by: number): TranscriptSegment[] =>
  spans.map((s) => ({ ...s, startSecond: s.startSecond + by, endSecond: s.endSecond + by }));

/** Part segments shifted to the recording's clock; a part without segments becomes one. */
function placeSegments(result: TranscriptResult, startSecond: number, endSecond: number): TranscriptSegment[] {
  if (result.segments.length === 0) return [{ text: result.text, startSecond, endSecond }];
  return shifted(result.segments, startSecond);
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

/** VAD ranges → chunks: merge short pauses, extend stubs to a minimum length, split what the adapter can't take. */
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

/** Only speech reaches the model, so silence can't become hallucinated text; a VAD failure sends all audio. A whole chunk goes
 *  as it is when it holds any speech, and not at all when it holds none. */
async function speechChunks(
  samples: Float32Array,
  maxPartSamples: number,
  { vad, whole }: Pick<TranscribeOptions, 'vad' | 'whole'>,
): Promise<Chunk[]> {
  try {
    const ranges = await (vad ?? getSpeechSegments)(samples);
    if (whole) return ranges.length > 0 ? [{ samples, startSecond: 0 }] : [];
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
/** Sends the parts in order; what was billed is reported however the run ends, so a part that failed or a cancel never
 *  hides the parts already paid for. */
async function transcribeChunks(
  chunks: Chunk[],
  transcribe: TranscribePart,
  request: Omit<PartRequest, 'wav'>,
  { onProgress, onBilled }: Pick<TranscribeOptions, 'onProgress' | 'onBilled'>,
): Promise<TranscriptResult> {
  const texts: string[] = [];
  const segments: TranscriptSegment[] = [];
  const words: TranscriptSegment[] = [];
  let adapterTimed = false;
  const billed: Billed = { audioSeconds: 0 };

  try {
    for (const [index, chunk] of chunks.entries()) {
      request.signal?.throwIfAborted();
      onProgress?.({ current: index + 1, total: chunks.length });
      const result = await transcribe({ ...request, wav: encodeWavInt16(chunk.samples, sampleRate) });
      billed.audioSeconds += chunk.samples.length / sampleRate;
      if (result.usage) billed.usage = mergeTokenUsage(billed.usage, result.usage);
      const cleaned = cleanText(result.text);
      if (!cleaned) continue;
      texts.push(cleaned);
      adapterTimed ||= result.segments.length > 0;
      const endSecond = chunk.startSecond + chunk.samples.length / sampleRate;
      segments.push(...placeSegments({ ...result, text: cleaned }, chunk.startSecond, endSecond));
      words.push(...shifted(result.words ?? [], chunk.startSecond));
    }
  } finally {
    if (billed.audioSeconds > 0) onBilled?.(billed);
  }

  // Timestamps when the engine gave them or the audio was split; one untimed part stays plain text.
  const timed = adapterTimed || texts.length > 1;
  return { text: texts.join('\n\n'), segments: timed ? segments : [], words };
}

export async function runTranscription(
  audio: Blob,
  selection: SpeechSelection,
  providers: ModelProvider[],
  { signal, onProgress, onBilled, vad, whole, transcribePart }: TranscribeOptions = {},
): Promise<TranscriptResult> {
  const adapterId = adapterFor(selection, providers);
  if (!adapterId) {
    throw new Error(`${getProviderTitle(selection.provider)} "${selection.model}" can't transcribe audio. Choose a speech model in Settings › Default Models.`);
  }
  const { model, resolved } = await speechModelFor(selection, providers);

  const samples = await toMonoSamples(audio, sampleRate);
  const chunks = await speechChunks(samples, TRANSCRIPTION_CONFIG.partSeconds[adapterId] * sampleRate, { vad, whole });
  if (chunks.length === 0) return { text: '', segments: [] };

  return transcribeChunks(chunks, transcribePart ?? ADAPTERS[adapterId], { model, resolved, terms: savedTerms(), signal }, { onProgress, onBilled });
}
