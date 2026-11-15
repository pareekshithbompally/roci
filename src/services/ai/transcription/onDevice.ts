/**
 * On this Mac — Kasset's own speech-to-text engine (transcribe.cpp in Rust,
 * src-tauri/src/stt): error copy, the per-part adapter, and its live engine.
 * The models and their downloads are local models
 * (`@services/localModels.service`); splitting, progress and cancellation of
 * whole recordings live in the shared pipeline.
 */

import { invoke } from '@tauri-apps/api/core';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { errorMessage, isCodedError } from '@shared/utils/errors';
import type { LocalErrorPayload } from '@services/localModels.service';
import { transcribeNatively } from './native';
import type { TranscribePart } from './types';
import type { LiveEngine, LiveText } from './live';

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

const display = (text: LiveText) => `${text.committed}${text.tentative}`.trim();

/** Live dictation on this Mac (models that stream: Parakeet, Nemotron). Audio goes as raw f32. */
export const onDeviceLive: LiveEngine = {
  start: (model, language) => invoke('stt_live_start', { model, language }),
  feed: (pcm) => invoke<LiveText>('stt_live_feed', new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
  finish: () => invoke<LiveText>('stt_live_finish').then(display),
  cancel: () => invoke('stt_live_cancel'),
};
