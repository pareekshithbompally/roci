import { useSettings } from '@shared/contexts/SettingsContext';
import { modelAvatarOrg } from '@services/modelAvatars';

/** Org avatar for a model under the user's Model Icons setting, or null. */
export function useModelAvatarOrg(provider: string, modelId: string | undefined): string | null {
  const { settings } = useSettings();
  return modelAvatarOrg(provider, modelId, !!settings.showModelAvatars);
}
