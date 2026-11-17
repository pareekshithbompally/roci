/** A model's display name (its rename, else its id) by provider and id, from every model source; the id itself when it isn't known. */

import { useSettings } from '@shared/contexts/SettingsContext';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { withIntegrationModels } from '@shared/utils/modelResolver';

export function useModelLabel(provider: string | undefined, modelId: string | undefined): string | undefined {
  const { providers, settings } = useSettings();
  if (!modelId) return undefined;
  const model = withIntegrationModels(providers, settings).find((p) => p.provider === provider)?.models?.find((m) => m.id === modelId);
  return model ? getModelDisplayName(model) : modelId;
}
