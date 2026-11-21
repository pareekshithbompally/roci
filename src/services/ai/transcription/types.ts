import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { TokenUsage } from '@services/ai/types';

export interface TranscriptSegment {
  text: string;
  startSecond: number;
  endSecond: number;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  /** Each word's own time, when the engine gives them (Roci's own engine does). */
  words?: TranscriptSegment[];
  /** Tokens spent, for engines billed by tokens (multimodal prompt); summed across parts. */
  usage?: TokenUsage;
  /** Audio sent to the engine, in seconds (what an engine billed by the minute counts); silence that was skipped isn't sent. */
  audioSeconds?: number;
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
  /** The provider + model with its key and base URL; null for keyless engines (Hex, Apple speech). */
  resolved: ResolvedModel | null;
  /** The custom vocabulary's terms, in priority order (engines that take terms read them). */
  terms: string[];
  signal?: AbortSignal;
}

/** One speech span in mono samples at the pipeline rate (from VAD). */
export interface SpeechRange {
  startSample: number;
  endSample: number;
}

/** Turns one WAV part into text (segments relative to the part's start). */
export type TranscribePart = (request: PartRequest) => Promise<TranscriptResult>;
