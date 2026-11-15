/**
 * Live transcription — dictation turned into text while it's spoken.
 *
 * Any engine that can do it implements `LiveEngine` and is registered here by
 * its speech provider; the catalog marks which of a provider's models stream
 * (`SpeechModelOption.live`). Callers never branch on an engine: they ask
 * `liveEngineFor(provider)` and drive the same four calls.
 */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { onDeviceLive } from './onDevice';

/** The text so far: settled words, then the latest words, still being revised. */
export interface LiveText {
  committed: string;
  tentative: string;
}

export const EMPTY_LIVE_TEXT: LiveText = { committed: '', tentative: '' };

export interface LiveEngine {
  /** Begins a dictation with one of the provider's streaming models. */
  start(model: string, language: string): Promise<void>;
  /** 16 kHz mono samples spoken since the last feed → the text so far. */
  feed(pcm: Float32Array): Promise<LiveText>;
  /** No more audio → the final text. */
  finish(): Promise<string>;
  /** Abandons the dictation. */
  cancel(): Promise<void>;
}

const ENGINES: Partial<Record<string, LiveEngine>> = {
  [TRANSCRIPTION_CONFIG.onDevice.provider]: onDeviceLive,
};

export function liveEngineFor(provider: string): LiveEngine | null {
  return ENGINES[provider] ?? null;
}
