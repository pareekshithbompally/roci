/** Read aloud: voices, speak a reply's markdown (reporting each chunk as it starts), and stop; system and downloaded voices in Rust, cloud voices here. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { READ_ALOUD_CONFIG, type ReadAloudEngine } from '@config/readAloud.config';
import { errorMessage, failureLogger, isCodedError } from '@shared/utils/errors';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import type { LocalErrorPayload } from '@services/localModels.service';
import type { ModelProvider } from '@shared/types/modelProviders';
import { cloudEngineOf, cloudVoices, speechFile } from '@services/ai/speech';
import type { CloudVoiceModel } from '@services/ai/speech';

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
    case 'not-downloaded': return "This voice isn't downloaded. Download it in Settings › Default Models.";
    case 'unknown-model': return 'Choose a voice in Settings › Default Models › Read aloud.';
    default: return `Couldn't read this aloud (${error.detail ?? error.code}).`;
  }
}

/** Who reads: the engine, its voice (undefined = the engine's default), and the providers a cloud engine's key comes from. */
export interface SpeakWith {
  engine: ReadAloudEngine;
  voice: string | undefined;
  providers: ModelProvider[];
}

let nextRequest = 0;

/** The cloud speech playing now: its request (to cancel) and its audio (to pause). */
let cloudPlaying: { controller: AbortController; audio: HTMLAudioElement | null } | null = null;

/** Plays a speech file to its end; resolves early when stopped. */
function playToEnd(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onpause = () => resolve();
    audio.onerror = () => reject(new Error("Couldn't play this voice's audio."));
    audio.play().catch(reject);
  });
}

/** Speaks with a cloud voice model: the same plain speech as Rust's engines, as one file from the asset store. */
async function speakCloud(text: string, engine: CloudVoiceModel, { voice, providers }: SpeakWith, onChunk: (spoken: string) => void): Promise<void> {
  const speakable = await invoke<string>('tts_speakable', { text });
  if (!speakable) return;
  const playing = { controller: new AbortController(), audio: null as HTMLAudioElement | null };
  cloudPlaying = playing;
  try {
    const url = await speechFile({ text: speakable, engine, voice, providers, signal: playing.controller.signal });
    if (playing.controller.signal.aborted) return;
    playing.audio = new Audio(url);
    onChunk(speakable);
    await playToEnd(playing.audio);
  } finally {
    if (cloudPlaying === playing) cloudPlaying = null;
  }
}

function stopCloud(): void {
  cloudPlaying?.controller.abort();
  cloudPlaying?.audio?.pause();
  cloudPlaying = null;
}

export const readAloud = {
  voices: async (engine: ReadAloudEngine): Promise<ReadAloudVoice[]> => {
    const cloud = cloudEngineOf(engine);
    if (cloud) return cloudVoices(cloud.provider).map((v) => ({ id: v, name: v, detail: null }));
    return platform.hasLocalModels && isTauriEnvironment() ? invoke<ReadAloudVoice[]>('tts_voices', { engine }) : [];
  },

  /** `onChunk` gets each chunk's text as its audio begins. */
  async speak(text: string, speaker: SpeakWith, onChunk: (spoken: string) => void): Promise<void> {
    const { engine, voice } = speaker;
    const cloud = cloudEngineOf(engine);
    if (cloud) return speakCloud(text, cloud, speaker, onChunk);
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

  stop: (): Promise<void> => {
    stopCloud();
    return invoke<void>('tts_stop').catch(report('stop'));
  },
};
