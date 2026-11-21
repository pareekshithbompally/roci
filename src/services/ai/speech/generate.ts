/** Speech from a cloud voice model through the AI SDK, as audio in memory (Read aloud plays it; nothing is kept). */

import { experimental_generateSpeech as generateSpeech } from 'ai';
import { createSpeechModel } from '@services/ai/provider';
import { resolveSpeechModel } from '@services/ai/transcription/cred';
import type { ModelRef } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';
import { recordUsage } from '@extensions/usage';
import { toMonoSamples } from '@shared/utils/wav.utils';
import { cloudVoices } from './catalog';

/** The rate the spoken audio is measured at; only its length matters. */
const MEASURE_RATE = 16_000;

/** Records the length of the audio a voice spoke; a file that can't be measured is logged, the read goes on. */
function recordSpoken(audio: Blob, engine: ModelRef): void {
  toMonoSamples(audio, MEASURE_RATE)
    .then((samples) => recordUsage('readAloud', { provider: engine.provider, modelId: engine.model }, undefined, undefined, samples.length / MEASURE_RATE))
    .catch((error: unknown) => console.error('[speechAudio] Usage not recorded:', error));
}

export interface SpeechRequest {
  text: string;
  engine: ModelRef;
  /** Undefined = the provider's default voice. */
  voice: string | undefined;
  providers: ModelProvider[];
  signal?: AbortSignal;
}

/** `text` spoken by the cloud model, its length recorded as usage; throws the user-facing reason. */
export async function speechAudio(request: SpeechRequest): Promise<Blob> {
  const { provider, model } = request.engine;
  const resolved = resolveSpeechModel(provider, model, request.providers);
  const voice = request.voice ?? cloudVoices(provider)[0];
  const { audio } = await generateSpeech({ model: createSpeechModel(resolved), text: request.text, voice, abortSignal: request.signal });
  const spoken = new Blob([audio.uint8Array], { type: audio.mediaType });
  recordSpoken(spoken, request.engine);
  return spoken;
}
