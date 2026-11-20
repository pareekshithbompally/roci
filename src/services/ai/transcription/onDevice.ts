/** Roci's own STT engine (transcribe.cpp in Rust): error copy, per-part adapter and live engine. */

import { invoke } from '@tauri-apps/api/core';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { errorMessage, isCodedError } from '@shared/utils/errors';
import type { LocalErrorPayload } from '@services/localModels.service';
import { transcribeNatively } from './native';
import type { TranscribePart } from './types';
import type { LiveText, StreamingEngine } from './streaming';
import { platform } from '@platform/index';

function onDeviceErrorMessage(error: unknown, model: string): string {
  if (!isCodedError<LocalErrorPayload>(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-downloaded': return `${model} isn't downloaded. Download it in Settings › Default Models.`;
    case 'unknown-model': return 'Choose a speech model in Settings › Default Models.';
    default: return `Couldn't transcribe this audio on this ${platform.deviceName} (${error.detail ?? error.code}).`;
  }
}

/** One WAV part → text with timestamps, on this device. */
export const onDeviceTranscribePart: TranscribePart = ({ wav, model }) =>
  transcribeNatively('stt_transcribe', wav, { 'x-stt-model': model, 'x-stt-language': TRANSCRIPTION_CONFIG.language })
    .catch((error: unknown) => {
      throw new Error(onDeviceErrorMessage(error, model), { cause: error });
    });

const display = (text: LiveText) => `${text.committed}${text.tentative}`.trim();

/** Streaming on this Mac (models that stream: Parakeet, Nemotron — the catalog knows which). The engine holds its one loaded
 *  model for the whole stream, so one stream runs at a time. Audio goes as raw f32. */
export const onDeviceStreaming: StreamingEngine = {
  concurrent: 1,
  async open({ model, language }) {
    await invoke('stt_live_start', { model, language });
    return {
      feed: (pcm) => invoke<LiveText>('stt_live_feed', new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
      finish: () => invoke<LiveText>('stt_live_finish').then(display),
      cancel: () => invoke('stt_live_cancel'),
    };
  },
};