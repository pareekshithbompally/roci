/** Speech from a cloud voice model through the AI SDK, saved to the asset store (`speech/`) with what it said. */

import { experimental_generateSpeech as generateSpeech } from 'ai';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { createSpeechModel } from '@services/ai/provider';
import { resolveSpeechModel } from '@services/ai/transcription/cred';
import { assetsService } from '@services/storage';
import type { ModelProvider } from '@shared/types/modelProviders';
import { cloudVoices } from './catalog';
import type { ModelRef } from '@services/ai/models';

export interface SpeechRequest {
  text: string;
  engine: ModelRef;
  /** Undefined = the provider's default voice. */
  voice: string | undefined;
  providers: ModelProvider[];
  signal?: AbortSignal;
}

/** What a saved speech file records about itself. */
export interface SpeechDetails {
  text: string;
  model: string;
  voice: string;
  /** Epoch ms. */
  createdAt: number;
}

/** Speaks `text` with the cloud model and saves it; returns a URL the webview plays. Throws the user-facing reason. */
export async function speechFile(request: SpeechRequest): Promise<string> {
  const { provider, model } = request.engine;
  const resolved = resolveSpeechModel(provider, model, request.providers);
  const voice = request.voice ?? cloudVoices(provider)[0];
  const { audio } = await generateSpeech({ model: createSpeechModel(resolved), text: request.text, voice, abortSignal: request.signal });
  const extension = READ_ALOUD_CONFIG.extensionByMediaType[audio.mediaType] ?? READ_ALOUD_CONFIG.defaultExtension;
  const details: SpeechDetails = { text: request.text, model, voice, createdAt: Date.now() };
  const saved = await assetsService.save('speech', audio.uint8Array, extension, details);
  return assetsService.fileUrl(saved.appPath);
}
