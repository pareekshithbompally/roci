/**
 * Read aloud (src-tauri/src/tts): an engine's voices, speaking a reply's
 * markdown in one, and stopping. `speak` reports each chunk of text as its
 * audio begins and resolves when the reply has been spoken or was stopped.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { READ_ALOUD_CONFIG, type ReadAloudEngine } from '@config/readAloud.config';
import { errorMessage, failureLogger, isCodedError } from '@shared/utils/errors';
import { isTauriEnvironment } from '@services/tauri';
import type { LocalErrorPayload } from '@services/localModels.service';

const report = failureLogger('readAloud');

/** Mirrors the Rust `VoiceOption`: `id` speaks with it, `name` is shown. */
export interface ReadAloudVoice {
  id: string;
  name: string;
  /** A quality note (Premium, Enhanced) where the system reports one. */
  detail: string | null;
}

function readAloudErrorMessage(error: unknown): string {
  if (!isCodedError<LocalErrorPayload>(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-downloaded': return "This voice isn't downloaded. Download it in Settings › Capabilities.";
    case 'unknown-model': return 'Choose a voice in Settings › Capabilities › Read aloud.';
    default: return `Couldn't read this aloud (${error.detail ?? error.code}).`;
  }
}

let nextRequest = 0;

export const readAloud = {
  voices: async (engine: ReadAloudEngine): Promise<ReadAloudVoice[]> =>
    isTauriEnvironment() ? invoke<ReadAloudVoice[]>('tts_voices', { engine }) : [],

  /** `voice` undefined = the engine's default. `onChunk` gets each chunk's text as its audio begins. */
  async speak(text: string, engine: ReadAloudEngine, voice: string | undefined, onChunk: (spoken: string) => void): Promise<void> {
    const id = ++nextRequest;
    const unlisten = await listen<{ id: number; text: string }>(READ_ALOUD_CONFIG.chunkEvent, ({ payload }) => {
      if (payload.id === id) onChunk(payload.text);
    });
    try {
      await invoke('tts_speak', { id, text, engine, voice: voice ?? null });
    } catch (error: unknown) {
      throw new Error(readAloudErrorMessage(error), { cause: error });
    } finally {
      unlisten();
    }
  },

  stop: (): Promise<void> => invoke<void>('tts_stop').catch(report('stop')),
};
