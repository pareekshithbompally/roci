/** A model's display name (its rename, else its id) by provider and id, from every model source; the id itself when it isn't known. */

import { useSettings } from '@shared/contexts/SettingsContext';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { modelSources } from '@shared/utils/modelResolver';

/** The name outside a hook, for a list of models (a menu's lines). */
export function modelNameOf(providers: ModelProvider[], settings: AppSettings, provider: string, modelId: string): string {
  const model = modelSources(providers, settings).find((p) => p.provider === provider)?.models?.find((m) => m.id === modelId);
  return model ? getModelDisplayName(model) : modelId;
}

export function useModelLabel(provider: string | undefined, modelId: string | undefined): string | undefined {
  const { providers, settings } = useSettings();
  return modelId ? modelNameOf(providers, settings, provider ?? '', modelId) : undefined;
}
