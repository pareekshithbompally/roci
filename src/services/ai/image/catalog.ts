/** Image model catalog: what Settings › Default Models offers, whether each can run now, and the model to call. */

import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { credentialsError } from '@services/ai/transcription/cred';
import { resolveProviderModel } from '@shared/utils/modelResolver';
import { getProviderTitle } from '@shared/utils/provider.utils';
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

/** Every curated image model, ready once its provider is on with a key. */
export function imageModelOptions(providers: ModelProvider[]): ImageModelOption[] {
  return Object.entries(IMAGE_GENERATION_CONFIG.engines).flatMap(([provider, engine]) => {
    const hint = credentialsError(provider, providers) === null ? null : `Add ${getProviderTitle(provider)} API key`;
    return engine.models.map((m) => ({ provider, model: m.id, label: m.label, ready: hint === null, hint }));
  });
}

/** What the Default Models picker stores for an image model. */
export function imageSelectionKey(selection: { provider: string; model: string }): string {
  return `${selection.provider}:${selection.model}`;
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
