/** Settings › Default Models' provider defaults: one row per provider with a set, and using one (list, then apply). */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { queryKeys } from '@shared/query/queryKeys';
import { showToast } from '@shared/ui';
import { failureLogger } from '@shared/utils/errors';
import { getDefaultBaseUrl } from '@shared/utils/modelResolver';
import { getProviderTitle, isLocalProviderId, providerSetting } from '@shared/utils/provider.utils';
import { defaultsFor, defaultsInUse, offeredDefaults } from '@services/ai/models';
import type { ListedModel, SetupDefaults } from '@services/ai/models';
import { providersService } from '@services/providers';
import type { LocalModel } from '@services/localModels.service';
import type { ModelProvider } from '@shared/types/modelProviders';
import { useAppleIntelligenceControls, useAppleSpeechStatus } from '@features/integrations';
import { ON_DEVICE_SETS, PROVIDER_DEFAULTS } from '@config/providerDefaults.config';
import type { OnDeviceSet, ProviderDefaultModels } from '@config/providerDefaults.config';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { platform } from '@platform/index';
import { useApplyDefaults } from './useProviderDefaults';

const COPY = DEFAULT_MODELS_CONFIG.providerDefaults;
const DEVICE = LOCAL_MODELS_CONFIG.provider.id;
const report = failureLogger('useProviderDefaultRows');

export interface ProviderDefaultRow {
  /** Unique per row: a provider with several sets (this device) has a row for each. */
  key: string;
  provider: string;
  title: string;
  /** What it would set, judged on its own set (cloud) or saved models (a server). */
  defaults: SetupDefaults;
  inUse: boolean;
  /** Its models still have to download (this device). */
  downloads: boolean;
  busy: boolean;
  use: () => void;
}

/** A provider's candidates: what it lists now (asked when used), and its record to save the models on. */
interface Source {
  key: string;
  id: string;
  /** Which of its sets, where it has several. */
  set?: ProviderDefaultModels;
  title: string;
  saved: ListedModel[];
  provider?: ModelProvider;
  downloads?: boolean;
  list: () => Promise<ListedModel[]>;
}

const asListed = (ids: string[]): ListedModel[] => ids.map((id) => ({ id, report: {} }));

/** Added providers with a set: a cloud provider with its key, or a server. */
const hasSet = (p: ModelProvider) => p.active !== false
  && (isLocalProviderId(p.provider) || (p.provider in PROVIDER_DEFAULTS && !!providerSetting(p, 'api-key')));

function useSources(): Source[] {
  const { providers } = useSettings();
  const queryClient = useQueryClient();
  const { data: localModels } = useLocalModels();
  const { access } = useAppleIntelligenceControls();

  return useMemo(() => {
    const listOf = (p: ModelProvider) => () => {
      const apiKey = providerSetting(p, 'api-key');
      const baseUrl = providerSetting(p, 'base-url') || getDefaultBaseUrl(p.provider) || '';
      return queryClient.fetchQuery({
        queryKey: queryKeys.providerModels(p.provider, baseUrl, apiKey),
        queryFn: () => providersService.fetchModelsFromProvider({ ...p, api_key: apiKey, base_url: baseUrl }),
        staleTime: 0,
      });
    };
    const added = providers.filter(hasSet).map((p): Source => ({
      key: p.provider, id: p.provider, title: getProviderTitle(p.provider), provider: p, saved: asListed((p.models ?? []).map((m) => m.id)), list: listOf(p),
    }));
    const sets = Object.keys(ON_DEVICE_SETS) as OnDeviceSet[];
    const device = platform.hasLocalModels && localModels ? sets.map((set) => deviceSource(localModels, set)) : [];
    const apple = access === 'ready' ? [appleSource()] : [];
    return [...added, ...device, ...apple];
  }, [providers, queryClient, localModels, access]);
}

function deviceSource(models: LocalModel[], set: OnDeviceSet): Source {
  const listed = asListed(models.map((m) => m.id));
  const wanted: string[] = Object.values(ON_DEVICE_SETS[set]);
  return {
    key: `${DEVICE}:${set}`,
    id: DEVICE,
    set: ON_DEVICE_SETS[set],
    title: COPY.deviceRow(ONBOARDING_CONFIG.setup.onDevice.title, COPY.sets[set].title),
    saved: listed,
    downloads: models.some((m) => wanted.includes(m.id) && !m.installed),
    list: () => Promise.resolve(listed),
  };
}

function appleSource(): Source {
  const listed = asListed([APPLE_INTELLIGENCE.model]);
  return { key: APPLE_INTELLIGENCE.provider, id: APPLE_INTELLIGENCE.provider, title: getProviderTitle(APPLE_INTELLIGENCE.provider), saved: listed, list: () => Promise.resolve(listed) };
}

/** Lists, then applies; a provider that can't be reached, or no longer lists its chat model, changes nothing. */
async function listThenApply(source: Source, apply: (listed: ListedModel[]) => boolean): Promise<void> {
  const listed = await source.list().catch((error: unknown) => {
    report('list')(error);
    showToast(COPY.failed(source.title), 'error');
    return null;
  });
  if (listed && !apply(listed)) showToast(COPY.noChat(source.title), 'error');
}

export function useProviderDefaultRows(): ProviderDefaultRow[] {
  const { settings } = useSettings();
  const { data: speech } = useAppleSpeechStatus(platform.hasAppleIntelligence);
  const applyDefaults = useApplyDefaults();
  const sources = useSources();
  const [busy, setBusy] = useState<string | null>(null);
  // Re-renders when the catalog arrives: a server's models are told apart by what it says of them.
  const catalogLoaded = useModelCatalog();
  const hasAppleSpeech = !!speech?.available;

  return useMemo(() => sources.map((source) => {
    const defaults = offeredDefaults(source.id, source.saved, hasAppleSpeech, source.set);
    const inUse = defaultsInUse(settings, defaults);
    const apply = (listed: ListedModel[]) => {
      if (!defaultsFor(source.id, listed, hasAppleSpeech, source.set).chat) return false;
      applyDefaults({ id: source.id, listed, provider: source.provider, set: source.set });
      return true;
    };
    const use = () => {
      if (inUse || busy) return;
      setBusy(source.key);
      void listThenApply(source, apply).finally(() => setBusy(null));
    };
    return {
      key: source.key, provider: source.id, title: source.title, defaults, inUse,
      downloads: !!source.downloads, busy: busy === source.key, use,
    };
  }), [sources, settings, hasAppleSpeech, applyDefaults, busy, catalogLoaded]);
}
