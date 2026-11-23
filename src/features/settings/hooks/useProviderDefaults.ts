/** A connected provider's default models, and Go with Defaults: the one way setup chooses models, whatever the provider. */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { queryKeys } from '@shared/query/queryKeys';
import { failureLogger } from '@shared/utils/errors';
import { useAppleSpeechStatus } from '@features/integrations';
import { defaultsFor, isAppleSpeech, settingsOfDefaults, speechSettings, withDefaultModels } from '@services/ai/models';
import type { ListedModel, ModelRef, SetupDefaults } from '@services/ai/models';
import { prepareAppleSpeech } from '@services/ai/transcription';
import { platform } from '@platform/index';
import type { LocalModel } from '@services/localModels.service';
import type { ModelProvider } from '@shared/types/modelProviders';
import { useLocalModelControls } from './useLocalModels';

const report = failureLogger('useProviderDefaults');

/** A provider that answered: what it lists, and the provider to save (none for Apple and this device's models). */
export interface DetectedProvider {
  id: string;
  listed: ListedModel[];
  provider?: ModelProvider;
}

export interface ProviderDefaultsSetup {
  defaults: SetupDefaults;
  /** The defaults still to download to this device. */
  downloads: LocalModel[];
  /** Saves the defaults; downloads and Apple Speech's permission carry on from there. */
  apply: () => void;
}

/** Null until a provider is detected. */
export function useProviderDefaults(detected: DetectedProvider | null): ProviderDefaultsSetup | null {
  const { providers, setSettings, addProvider, updateProvider } = useSettings();
  const queryClient = useQueryClient();
  const { data: speech } = useAppleSpeechStatus(platform.hasAppleIntelligence);
  const { data: localModels } = useLocalModels();
  const controls = useLocalModelControls();
  // Re-renders when the catalog arrives: a server's models are told apart by what it says of them.
  const catalogLoaded = useModelCatalog();

  const defaults = useMemo(
    () => (detected ? defaultsFor(detected.id, detected.listed, !!speech?.available) : null),
    [detected, speech?.available, catalogLoaded],
  );
  const downloads = useMemo(() => {
    const ids = new Set([defaults?.chat, defaults?.transcription].filter((ref) => ref?.provider === detected?.id).map((ref) => ref?.model));
    return (localModels ?? []).filter((m) => ids.has(m.id) && m.id in controls && !m.installed);
  }, [localModels, controls, defaults, detected]);

  const saveProvider = useCallback((provider: ModelProvider, listed: ListedModel[], picks: SetupDefaults) => {
    const models = (saved: ModelProvider) => withDefaultModels(saved.models ?? [], picks, provider.provider, listed);
    if (providers.some((p) => p.provider === provider.provider)) {
      updateProvider(provider.provider, (current) => ({ active: true, models: models(current) }));
    } else {
      addProvider({ ...provider, active: true, models: models(provider) });
    }
  }, [providers, addProvider, updateProvider]);

  /** Chosen only once it can run, so a denial keeps the speech model there was. */
  const switchToAppleSpeech = useCallback((ref: ModelRef) => {
    prepareAppleSpeech()
      .then((ready) => {
        if (ready) setSettings(speechSettings(ref));
        return queryClient.invalidateQueries({ queryKey: queryKeys.appleSpeechStatus() });
      })
      .catch(report('speech setup'));
  }, [setSettings, queryClient]);

  if (!detected || !defaults) return null;

  const apply = () => {
    if (detected.provider) saveProvider(detected.provider, detected.listed, defaults);
    setSettings(settingsOfDefaults(defaults));
    downloads.filter((m) => controls[m.id].status === 'idle').forEach((m) => controls[m.id].download());
    if (defaults.transcription && isAppleSpeech(defaults.transcription)) switchToAppleSpeech(defaults.transcription);
  };

  return { defaults, downloads, apply };
}
