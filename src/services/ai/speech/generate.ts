/** Speech from a cloud voice model through the AI SDK, as audio in memory (Read aloud plays it; nothing is kept). */

import { experimental_generateSpeech as generateSpeech } from 'ai';
import { createSpeechModel } from '@services/ai/provider';
import { resolveSpeechModel } from '@services/ai/transcription/cred';
import type { ModelRef } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';
import { cloudVoices } from './catalog';

export interface SpeechRequest {
  text: string;
  engine: ModelRef;
  /** Undefined = the provider's default voice. */
  voice: string | undefined;
  providers: ModelProvider[];
  signal?: AbortSignal;
}

/** `text` spoken by the cloud model; throws the user-facing reason. */
export async function speechAudio(request: SpeechRequest): Promise<Blob> {
  const { provider, model } = request.engine;
  const resolved = resolveSpeechModel(provider, model, request.providers);
  const voice = request.voice ?? cloudVoices(provider)[0];
  const { audio } = await generateSpeech({ model: createSpeechModel(resolved), text: request.text, voice, abortSignal: request.signal });
  return new Blob([audio.uint8Array], { type: audio.mediaType });
}
