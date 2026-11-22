/**
 * A provider's connection test: listing its models with the saved key and URL, which only a valid key can do.
 * Runs only when Test is pressed or Add model opens; editing the key or URL starts a fresh, untested query.
 * The list it returns is what Add model searches; each test also saves what the list says about the saved models, and its
 * outcome (`connection_check`), which is shown after a relaunch until the next test.
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { providersService } from '@services/providers';
import { withReports } from '@services/ai/models';
import type { ListedModel } from '@services/ai/models';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { errorMessage } from '@shared/utils/errors';
import { getDefaultBaseUrl, isManagedSDK } from '@shared/utils/modelResolver';
import { providerSetting } from '@shared/utils/provider.utils';
import type { ConnectionCheck, ModelProvider } from '@shared/types/modelProviders';

export type ConnectionStatus =
  /** The key (or a custom provider's URL) is missing. */
  | { state: 'incomplete' }
  | { state: 'untested' }
  | { state: 'checking' }
  | { state: 'connected'; models: ListedModel[] }
  | { state: 'failed'; message: string }
  /** The saved outcome of a test in an earlier session (this session hasn't tested). */
  | { state: 'checked'; check: ConnectionCheck };

export interface ProviderConnection {
  status: ConnectionStatus;
  test: () => void;
}

function statusOf(query: UseQueryResult<ListedModel[]>, complete: boolean, check: ConnectionCheck | undefined): ConnectionStatus {
  if (!complete) return { state: 'incomplete' };
  if (query.isFetching) return { state: 'checking' };
  if (query.isError) return { state: 'failed', message: errorMessage(query.error) };
  if (query.data) return { state: 'connected', models: query.data };
  return check ? { state: 'checked', check } : { state: 'untested' };
}

export function useProviderConnection(provider: ModelProvider): ProviderConnection {
  const { updateProvider } = useSettings();
  const apiKey = providerSetting(provider, 'api-key');
  const baseUrl = providerSetting(provider, 'base-url') || getDefaultBaseUrl(provider.provider) || '';
  const complete = !!apiKey && (isManagedSDK(provider.provider) || !!baseUrl);

  const query = useQuery({
    queryKey: queryKeys.providerModels(provider.provider, baseUrl, apiKey),
    queryFn: () => providersService.fetchModelsFromProvider({ ...provider, api_key: apiKey, base_url: baseUrl }),
    enabled: false,
    retry: false,
    staleTime: Infinity,
  });

  return {
    status: statusOf(query, complete, provider.connection_check),
    test: () => {
      if (!complete) return;
      void query.refetch().then(({ data, error }) => {
        const at = Date.now();
        // Merged into the models as saved when it lands, so a model added during the test is kept and described.
        updateProvider(provider.provider, (current) => (data
          ? { models: withReports(current.models ?? [], data), connection_check: { ok: true, at, models: data.length } }
          : { connection_check: { ok: false, at, message: errorMessage(error) } }));
      });
    },
  };
}
