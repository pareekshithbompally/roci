/**
 * Apple Speech — transcription on this Mac (SpeechAnalyzer, macOS 26+) through
 * the apple-intelligence plugin: status, error copy, and the per-part adapter.
 * Permission and model download are handled in Integrations › Apple Intelligence.
 */

import { invoke } from '@tauri-apps/api/core';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { appleIntelligence, isAppleError, type AppleSpeechSegment, type AppleSpeechStatus } from '@services/ai/apple/appleIntelligence.service';
import type { TranscribePart } from './types';

/** Ready to transcribe: available, allowed, and the language model downloaded. */
export function isAppleSpeechReady(status: AppleSpeechStatus | undefined): boolean {
  return !!status?.available && status.authorization === 'authorized' && status.installed;
}

/** The next step when Apple Speech can't run yet; null when ready. */
export function appleSpeechHint(status: AppleSpeechStatus | undefined): string | null {
  if (!status?.available) return 'Not available on this Mac';
  if (status.authorization !== 'authorized') return 'Allow Speech Recognition in Integrations';
  if (!status.installed) return 'Download the speech model in Integrations';
  return null;
}

export const getAppleSpeechStatus = (): Promise<AppleSpeechStatus> =>
  appleIntelligence.speechStatus(TRANSCRIPTION_CONFIG.language);

function appleSpeechErrorMessage(error: unknown): string {
  if (!isAppleError(error)) return error instanceof Error ? error.message : String(error);
  switch (error.code) {
    case 'not-authorized': return 'Speech Recognition is off for Kasset. Allow it in Settings › Integrations › Apple Intelligence.';
    case 'model-not-ready': return 'The Apple speech model isn\'t downloaded. Download it in Settings › Integrations › Apple Intelligence.';
    case 'unsupported-language': return 'Apple speech doesn\'t support this language.';
    case 'unavailable': return error.detail ?? 'Apple speech isn\'t available on this Mac.';
    default: return `Apple speech couldn't transcribe this audio (${error.detail ?? error.code}).`;
  }
}

/** One WAV part → text with timestamps (Rust writes a temporary file for SpeechAnalyzer). */
export const appleSpeechTranscribePart: TranscribePart = async ({ wav }) => {
  try {
    const segments = await invoke<AppleSpeechSegment[]>('plugin:apple-intelligence|speech_transcribe', wav, {
      headers: { 'x-language': TRANSCRIPTION_CONFIG.language },
    });
    return {
      text: segments.map((s) => s.text).join(' ').trim(),
      segments: segments.map((s) => ({ text: s.text, startSecond: s.start, endSecond: s.end })),
    };
  } catch (error: unknown) {
    throw new Error(appleSpeechErrorMessage(error), { cause: error });
  }
};
