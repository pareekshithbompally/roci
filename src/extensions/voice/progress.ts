/**
 * Voice Progress Bridge
 *
 * Same event-based pattern as the RAG progress bridge, but a separate
 * listener so voice download events never disturb the embedding flow.
 * The download modal subscribes to both and writes per-model tray rows.
 */

import type { DownloadableVoiceId } from './constants';

/** Voice model lifecycle events */
export interface VoiceModelEvent {
  kind: 'voice-model';
  /** Which downloadable voice. */
  voice: DownloadableVoiceId;
  status: 'downloading' | 'loading' | 'ready' | 'error';
  /** File currently being downloaded */
  file?: string;
  /** Bytes loaded so far */
  loaded?: number;
  /** Total bytes expected */
  total?: number;
  /** 0-100 percentage */
  percent?: number;
  /** Error message if status is 'error' */
  error?: string;
}

export type VoiceProgressEvent = VoiceModelEvent;

type ProgressListener = (event: VoiceProgressEvent) => void;

let listener: ProgressListener | null = null;

/** Emit a voice progress event (no-op when nobody listens). */
export function emitVoiceProgress(event: VoiceProgressEvent): void {
  listener?.(event);
}

/** Subscribe to voice progress events. Returns an unsubscribe function. */
export function onVoiceProgress(cb: ProgressListener): () => void {
  listener = cb;
  return () => { listener = null; };
}
