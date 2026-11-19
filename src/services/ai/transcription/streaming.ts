/** The speech engines that stream — words as they are said — keyed by adapter: the one place that knows which models stream and
 *  how many streams an engine runs at once. Every other model goes live in chunks (see live.ts). */

import { TRANSCRIPTION_CONFIG, type TranscriptionAdapterId } from '@config/transcription.config';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { onDeviceStreaming } from './onDevice';
import { appleSpeechStreaming } from './appleSpeech';
import { sdkStreaming } from './sdkStream';

/** The text so far: settled words, then the latest words, still being revised. */
export interface LiveText {
  committed: string;
  tentative: string;
}

export const EMPTY_LIVE_TEXT: LiveText = { committed: '', tentative: '' };

/** One running stream: 16 kHz mono audio in, the text so far out. */
export interface LiveStream {
  feed(pcm: Float32Array): Promise<LiveText>;
  /** No more audio → the final text. */
  finish(): Promise<string>;
  /** Abandons the stream. */
  cancel(): Promise<void>;
}

export interface StreamingEngine {
  /** Streams it runs at once: a meeting needs two (you and the call), dictation one. */
  concurrent: number;
  /** Whether this model of the engine streams. */
  streams(model: string): boolean;
  open(request: { model: string; resolved: ResolvedModel | null; language: string }): Promise<LiveStream>;
}

const { streamingModels } = TRANSCRIPTION_CONFIG;
const cloud = (adapter: 'openai-compatible' | 'deepgram' | 'elevenlabs'): StreamingEngine =>
  sdkStreaming(adapter, (model) => streamingModels[adapter]?.test(model) ?? false);

export const STREAMING: Partial<Record<TranscriptionAdapterId, StreamingEngine>> = {
  'on-device': onDeviceStreaming,
  'apple-speech': appleSpeechStreaming,
  'openai-compatible': cloud('openai-compatible'),
  deepgram: cloud('deepgram'),
  elevenlabs: cloud('elevenlabs'),
};

/** Whether a model streams through its adapter (cloud models by name; the catalog knows which local models stream). */
export function canStream(adapter: TranscriptionAdapterId | null, model: string): boolean {
  return !!adapter && (STREAMING[adapter]?.streams(model) ?? false);
}
