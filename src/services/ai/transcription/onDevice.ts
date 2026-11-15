/**
 * On this Mac — Kasset's own speech-to-text engine (transcribe.cpp in Rust,
 * src-tauri/src/stt): error copy and the per-part adapter. The models and
 * their downloads are local models (`@services/localModels.service`);
 * splitting, progress and cancellation live in the shared pipeline.
 */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { errorMessage, isCodedError } from '@shared/utils/errors';
import type { LocalErrorPayload } from '@services/localModels.service';
import { transcribeNatively } from './native';
import type { TranscribePart } from './types';

function onDeviceErrorMessage(error: unknown, model: string): string {
  if (!isCodedError<LocalErrorPayload>(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-downloaded': return `${model} isn't downloaded. Download it in Settings › Capabilities.`;
    case 'unknown-model': return 'Choose a speech model in Settings › Capabilities.';
    default: return `Couldn't transcribe this audio on this Mac (${error.detail ?? error.code}).`;
  }
}

/** One WAV part → text with timestamps, on this Mac. */
export const onDeviceTranscribePart: TranscribePart = ({ wav, model }) =>
  transcribeNatively('stt_transcribe', wav, { 'x-stt-model': model, 'x-stt-language': TRANSCRIPTION_CONFIG.language })
    .catch((error: unknown) => {
      throw new Error(onDeviceErrorMessage(error, model), { cause: error });
    });
