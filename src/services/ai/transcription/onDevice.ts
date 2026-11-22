/** Roci's own STT engine (transcribe.cpp in Rust): error copy, per-part adapter and live engine. */

import { invoke } from '@tauri-apps/api/core';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { errorMessage, isCodedError } from '@shared/utils/errors';
import type { LocalErrorPayload } from '@services/localModels.service';
import { transcribeNatively } from './native';
import type { TranscribePart } from './types';
import type { LiveText, StreamingEngine } from './streaming';
import type { RecognitionBoost } from '@config/personalization.config';
import type { VocabularyEntry } from '@shared/types';
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

/** The custom vocabulary and boost the engine's runs read from now on. */
export const setSpeechVocabulary = (entries: VocabularyEntry[], boost: RecognitionBoost): Promise<void> =>
  invoke('stt_set_vocabulary', { entries, boost });

const display = (text: LiveText) => `${text.committed}${text.tentative}`.trim();

/** The engine's one stream is taken (a meeting or a dictation holds it until it finishes or is cancelled). */
let streamTaken = false;

/** Streaming on this Mac (models that stream: Parakeet, Nemotron — the catalog knows which). The engine holds its one loaded
 *  model for the whole stream, so one stream runs at a time: a second open is refused while one is held (a dictation then
 *  records its clip, a meeting goes to chunks), never replacing it. Audio goes as raw f32. */
export const onDeviceStreaming: StreamingEngine = {
  concurrent: 1,
  async open({ model, language }) {
    if (streamTaken) throw new Error(`Live speech is already running on this ${platform.deviceName}.`);
    const worded = (error: unknown): never => {
      throw new Error(onDeviceErrorMessage(error, model), { cause: error });
    };
    const release = () => {
      streamTaken = false;
    };
    streamTaken = true;
    await invoke('stt_live_start', { model, language }).catch((error: unknown) => {
      release();
      return worded(error);
    });
    return {
      feed: (pcm) => invoke<LiveText>('stt_live_feed', new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)).catch(worded),
      finish: () => invoke<LiveText>('stt_live_finish').then(display, worded).finally(release),
      cancel: () => invoke<void>('stt_live_cancel').finally(release),
    };
  },
};