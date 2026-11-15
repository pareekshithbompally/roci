/** A saved model's display name (its rename, else its id) by provider and id; the id itself when it isn't saved. */

import { useSettings } from '@shared/contexts/SettingsContext';
import { getModelDisplayName } from '@shared/utils/provider.utils';

export function useModelLabel(provider: string | undefined, modelId: string | undefined): string | undefined {
  const { providers } = useSettings();
  if (!modelId) return undefined;
  const model = providers.find((p) => p.provider === provider)?.models?.find((m) => m.id === modelId);
  return model ? getModelDisplayName(model) : modelId;
}
