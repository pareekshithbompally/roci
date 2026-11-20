/** The speech engines that stream — words as they are said — keyed by adapter, with how many streams each runs at once. Whether
 *  a model streams is found by opening its stream: a model that can't refuses it (see live.ts). */

import type { TranscriptionAdapterId } from '@config/transcription.config';
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
  /** Opens a stream; rejects when the model can't stream. */
  open(request: { model: string; resolved: ResolvedModel | null; language: string }): Promise<LiveStream>;
}

export const STREAMING: Partial<Record<TranscriptionAdapterId, StreamingEngine>> = {
  'on-device': onDeviceStreaming,
  'apple-speech': appleSpeechStreaming,
  'openai-compatible': sdkStreaming('openai-compatible'),
  deepgram: sdkStreaming('deepgram'),
  elevenlabs: sdkStreaming('elevenlabs'),
};
