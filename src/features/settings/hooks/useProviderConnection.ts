/**
 * A provider's connection test: listing its models with the saved key and URL, which only a valid key can do.
 * Runs only when Test is pressed or Add model opens; editing the key or URL starts a fresh, untested query.
 * The list it returns is what Add model searches.
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { providersService } from '@services/providers';
import { queryKeys } from '@shared/query/queryKeys';
import { errorMessage } from '@shared/utils/errors';
import { getDefaultBaseUrl, isManagedSDK } from '@shared/utils/modelResolver';
import { providerSetting } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';

export type ConnectionStatus =
  /** The key (or a custom provider's URL) is missing. */
  | { state: 'incomplete' }
  | { state: 'untested' }
  | { state: 'checking' }
  | { state: 'connected'; modelIds: string[] }
  | { state: 'failed'; message: string };

export interface ProviderConnection {
  status: ConnectionStatus;
  test: () => void;
}

function statusOf(query: UseQueryResult<string[]>, complete: boolean): ConnectionStatus {
  if (!complete) return { state: 'incomplete' };
  if (query.isFetching) return { state: 'checking' };
  if (query.isError) return { state: 'failed', message: errorMessage(query.error) };
  if (query.data) return { state: 'connected', modelIds: query.data };
  return { state: 'untested' };
}

export function useProviderConnection(provider: ModelProvider): ProviderConnection {
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
    status: statusOf(query, complete),
    test: () => {
      if (complete) void query.refetch();
    },
  };
}
