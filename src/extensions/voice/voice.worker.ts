/**
 * Voice worker — loads one downloadable voice (Kokoro via kokoro-js,
 * Supertonic via the transformers.js text-to-speech pipeline) and synthesizes
 * text off the main thread.
 *
 *   Main → Worker:  { type: 'load', id, spec }   { type: 'speak', requestId, text }
 *   Worker → Main:  { type: 'progress', id, ...hfProgress }   { type: 'loaded', id }
 *                   { type: 'audio', requestId, audio, samplingRate }   { type: 'error', id?, requestId?, message }
 */

import type { DownloadableVoice } from './constants';
import { SUPERTONIC_OPTIONS } from './constants';

interface RawAudioLike {
  audio: Float32Array;
  sampling_rate: number;
}

type Speaker = (text: string) => Promise<RawAudioLike>;

let loaded: { id: string; speak: Speaker } | null = null;

const progressFor = (id: string) => (event: Record<string, unknown>) => self.postMessage({ type: 'progress', id, ...event });

async function loadKokoro(id: string, spec: DownloadableVoice): Promise<Speaker> {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained(spec.model, { dtype: spec.dtype, device: 'wasm', progress_callback: progressFor(id) });
  return async (text) => {
    const { audio, sampling_rate } = await tts.generate(text, { voice: spec.voice as never });
    return { audio: audio as Float32Array, sampling_rate };
  };
}

async function loadSupertonic(id: string, spec: DownloadableVoice): Promise<Speaker> {
  const { pipeline } = await import('@huggingface/transformers');
  const tts = await pipeline('text-to-speech', spec.model, { progress_callback: progressFor(id) });
  // The voice file once, not on every call.
  const voiceUrl = `https://huggingface.co/${spec.model}/resolve/main/voices/${spec.voice}.bin`;
  const speaker = new Float32Array(await (await fetch(voiceUrl)).arrayBuffer());
  return (text) => tts(`<en>${text}</en>`, { speaker_embeddings: speaker, ...SUPERTONIC_OPTIONS }) as Promise<RawAudioLike>;
}

const LOADERS = { kokoro: loadKokoro, supertonic: loadSupertonic };

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'load') {
    try {
      if (loaded?.id !== msg.id) loaded = { id: msg.id, speak: await LOADERS[msg.spec.engine as keyof typeof LOADERS](msg.id, msg.spec) };
      self.postMessage({ type: 'loaded', id: msg.id });
    } catch (error: unknown) {
      self.postMessage({ type: 'error', id: msg.id, message: error instanceof Error ? error.message : 'Voice failed to load' });
    }
    return;
  }
  if (msg.type === 'speak') {
    try {
      if (!loaded) throw new Error('No voice loaded');
      const { audio, sampling_rate } = await loaded.speak(msg.text);
      self.postMessage({ type: 'audio', requestId: msg.requestId, audio, samplingRate: sampling_rate }, { transfer: [audio.buffer] });
    } catch (error: unknown) {
      self.postMessage({ type: 'error', requestId: msg.requestId, message: error instanceof Error ? error.message : 'Speech failed' });
    }
  }
};
