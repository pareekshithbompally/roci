/**
 * Read aloud (src-tauri/src/tts): speak a reply's markdown in a voice, or
 * stop. `speak` resolves when the reply has been spoken or was stopped.
 */

import { invoke } from '@tauri-apps/api/core';
import { errorMessage, isCodedError } from '@shared/utils/errors';
import type { LocalErrorPayload } from '@services/localModels.service';
import type { ReadAloudVoice } from '@config/readAloud.config';

function readAloudErrorMessage(error: unknown): string {
  if (!isCodedError<LocalErrorPayload>(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-downloaded': return "This voice isn't downloaded. Download it in Settings › Capabilities.";
    case 'unknown-model': return 'Choose a voice in Settings › Capabilities › Read aloud.';
    default: return `Couldn't read this aloud (${error.detail ?? error.code}).`;
  }
}

export const readAloud = {
  speak: (text: string, voice: ReadAloudVoice): Promise<void> =>
    invoke<void>('tts_speak', { text, voice }).catch((error: unknown) => {
      throw new Error(readAloudErrorMessage(error), { cause: error });
    }),
  stop: (): Promise<void> => invoke('tts_stop'),
};
