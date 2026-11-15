/** On-Mac engine contract: the WAV part is the raw invoke body, options are headers, text and spans come back. */

import { invoke } from '@tauri-apps/api/core';
import type { TranscriptResult } from './types';

/** One piece of text and its span in seconds (Rust `TimedText`, Swift segment). */
export interface TimedText {
  text: string;
  start: number;
  end: number;
}

/** Sends one WAV part to a native transcription command; rejects with the command's own error. */
export async function transcribeNatively(command: string, wav: Uint8Array, headers: Record<string, string>): Promise<TranscriptResult> {
  const pieces = await invoke<TimedText[]>(command, wav, { headers });
  return {
    text: pieces.map((p) => p.text).join(' ').trim(),
    segments: pieces.map((p) => ({ text: p.text, startSecond: p.start, endSecond: p.end })),
  };
}
