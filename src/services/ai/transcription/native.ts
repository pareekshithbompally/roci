/** On-Mac engine contract: the WAV part is the raw invoke body, options are headers, text and spans come back. */

import { invoke } from '@tauri-apps/api/core';
import type { TranscriptResult } from './types';

/** One piece of text and its span in seconds (Rust `TimedText`, Swift segment). */
export interface TimedText {
  text: string;
  start: number;
  end: number;
}

/** What a native engine heard: timed segments, and words when it gives them (Rust `Timed`, Swift transcription). */
interface NativeTranscript {
  segments: TimedText[];
  words: TimedText[];
}

const spanOf = (p: TimedText) => ({ text: p.text, startSecond: p.start, endSecond: p.end });

/** Sends one WAV part to a native transcription command; rejects with the command's own error. */
export async function transcribeNatively(command: string, wav: Uint8Array, headers: Record<string, string>): Promise<TranscriptResult> {
  const { segments, words } = await invoke<NativeTranscript>(command, wav, { headers });
  return { text: segments.map((p) => p.text).join(' ').trim(), segments: segments.map(spanOf), words: words.map(spanOf) };
}
