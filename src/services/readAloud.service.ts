/** Read aloud: voices, speak a reply's markdown (reporting each chunk as it starts), stop, and render it to a WAV file (Save);
 *  system and downloaded voices in Rust, cloud voices here. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { READ_ALOUD_CONFIG, type ReadAloudEngine } from '@config/readAloud.config';
import { errorMessage, failureLogger, isCodedError } from '@shared/utils/errors';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import type { LocalErrorPayload } from '@services/localModels.service';
import type { ModelProvider } from '@shared/types/modelProviders';
import { cloudVoices, speechAudio } from '@services/ai/speech';
import { encodeWavInt16, toMonoSamples } from '@shared/utils/wav.utils';
import { parseModelKey } from '@services/ai/models';
import type { ModelRef } from '@services/ai/models';

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

/** The cloud read in progress, so a new read or Stop ends it wherever it is (fetching or playing). */
let cloudRead: AbortController | null = null;

/** Plays `audio` to its end; resolves early, paused, when `signal` aborts. */
function playToEnd(audio: Blob, signal: AbortSignal): Promise<void> {
  const url = URL.createObjectURL(audio);
  const player = new Audio(url);
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      player.pause();
      resolve();
    };
    signal.addEventListener('abort', done, { once: true });
    player.onended = done;
    player.onerror = () => reject(new Error("Couldn't play this voice's audio."));
    player.play().catch(reject);
  }).finally(() => URL.revokeObjectURL(url));
}

/** Reads with a cloud voice model: Rust's plain-speech chunks, each fetched then played in turn; Stop ends it quietly. */
async function speakCloud(text: string, engine: ModelRef, { voice, providers }: SpeakWith, onChunk: (spoken: string) => void): Promise<void> {
  const read = new AbortController();
  cloudRead = read;
  try {
    const chunks = await invoke<string[]>('tts_chunks', { text, maxChars: READ_ALOUD_CONFIG.cloudChunkChars });
    for (const chunk of chunks) {
      const audio = await speechAudio({ text: chunk, engine, voice, providers, signal: read.signal });
      if (read.signal.aborted) return;
      onChunk(chunk);
      await playToEnd(audio, read.signal);
      if (read.signal.aborted) return;
    }
  } catch (error: unknown) {
    if (!read.signal.aborted) throw error;
  } finally {
    if (cloudRead === read) cloudRead = null;
  }
}

/** A cloud voice's reading as one WAV: each chunk fetched and decoded, joined at one rate. */
async function renderCloud(text: string, engine: ModelRef, { voice, providers }: SpeakWith): Promise<Uint8Array> {
  const rate = READ_ALOUD_CONFIG.saveSampleRate;
  const chunks = await invoke<string[]>('tts_chunks', { text, maxChars: READ_ALOUD_CONFIG.cloudChunkChars });
  const parts: Float32Array[] = [];
  for (const chunk of chunks) parts.push(await toMonoSamples(await speechAudio({ text: chunk, engine, voice, providers }), rate));
  const joined = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => (joined.set(part, at), at + part.length), 0);
  return encodeWavInt16(joined, rate);
}

/** Ends any read in progress, cloud or Rust: one read at a time. */
async function stopAll(): Promise<void> {
  cloudRead?.abort();
  cloudRead = null;
  await invoke<void>('tts_stop').catch(report('stop'));
}

export const readAloud = {
  voices: async (engine: ReadAloudEngine): Promise<ReadAloudVoice[]> => {
    const cloud = parseModelKey(engine);
    if (cloud) return cloudVoices(cloud.provider).map((v) => ({ id: v, name: v, detail: null }));
    return platform.hasLocalModels && isTauriEnvironment() ? invoke<ReadAloudVoice[]>('tts_voices', { engine }) : [];
  },

  /** `onChunk` gets each chunk's text as its audio begins. */
  async speak(text: string, speaker: SpeakWith, onChunk: (spoken: string) => void): Promise<void> {
    const { engine, voice } = speaker;
    await stopAll();
    const cloud = parseModelKey(engine);
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

  stop: stopAll,

  /** The reply read by `speaker` as one WAV file's bytes, without playing it (Save in Read Aloud). */
  async render(text: string, speaker: SpeakWith): Promise<Uint8Array> {
    const cloud = parseModelKey(speaker.engine);
    if (cloud) return renderCloud(text, cloud, speaker);
    try {
      return new Uint8Array(await invoke<ArrayBuffer>('tts_render', { text, engine: speaker.engine, voice: speaker.voice ?? null }));
    } catch (error: unknown) {
      throw new Error(readAloudErrorMessage(error), { cause: error });
    }
  },
};
