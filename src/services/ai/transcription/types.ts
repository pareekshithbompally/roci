import type { Cred } from './cred';

export interface TranscriptSegment {
  text: string;
  startSecond: number;
  endSecond: number;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

export interface TranscriptionProgress {
  current: number;
  total: number;
}

/** A transcription model choice: which provider, which of its speech models. */
export interface SpeechSelection {
  provider: string;
  model: string;
}

/** One part sent to an adapter: complete 16 kHz mono WAV. */
export interface PartRequest {
  wav: Uint8Array;
  model: string;
  /** The provider's credentials; null for Hex (no key). */
  cred: Cred | null;
  signal?: AbortSignal;
}

/** One speech span in mono samples at the pipeline rate (from VAD). */
export interface SpeechRange {
  startSample: number;
  endSample: number;
}

/** Turns one WAV part into text (segments relative to the part's start). */
export type TranscribePart = (request: PartRequest) => Promise<TranscriptResult>;
