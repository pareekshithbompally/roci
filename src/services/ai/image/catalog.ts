/** Image model catalog: what Settings › Default Models offers, whether each can run now, and the model to call. */

import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { credentialsError } from '@services/ai/transcription/cred';
import { resolveProviderModel } from '@shared/utils/modelResolver';
import { jobRecords } from '@services/ai/models';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ResolvedModel } from '@shared/utils/modelResolver';

export interface ImageModelOption {
  provider: string;
  model: string;
  label: string;
  /** Its provider is on and has a key. */
  ready: boolean;
  /** Next step when not ready ("Add OpenAI API key"). */
  hint: string | null;
}

/** The image models the user added, on providers Roci can make images with. */
export function imageModelOptions(providers: ModelProvider[]): ImageModelOption[] {
  return jobRecords(providers, 'image')
    .filter((r) => r.provider in IMAGE_GENERATION_CONFIG.engines)
    .map((r) => ({ provider: r.provider, model: r.id, label: r.label, ready: r.ready, hint: r.hint }));
}

/** Chat can make images: an image model is chosen. */
export function hasImageModel(settings: AppSettings): boolean {
  return !!settings.imageProvider && !!settings.imageModel;
}

/** The chosen image model with its key; throws the user-facing reason when it can't run. */
export function resolveImageModel(settings: AppSettings, providers: ModelProvider[]): ResolvedModel {
  const { imageProvider, imageModel } = settings;
  if (!imageProvider || !imageModel) throw new Error('Choose an image model in Settings › Default Models.');
  const error = credentialsError(imageProvider, providers);
  if (error) throw new Error(error);
  const resolved = resolveProviderModel(imageProvider, imageModel, providers);
  if (!resolved) throw new Error('Choose an image model in Settings › Default Models.');
  return resolved;
}
