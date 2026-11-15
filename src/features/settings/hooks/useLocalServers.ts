/** Detected local servers merged with saved ones, plus switch on, rescan and add-by-URL; re-probes on focus. */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import {
  customServerId,
  detectLocalServers,
  localRows,
  normalizeLocalUrl,
  probeModels,
  savedLocalProviders,
  savedTargetKeys,
  syncModels,
  toLocalProvider,
} from '@services/providers/localServers';
import type { LocalRow, LocalServer } from '@services/providers/localServers';

export type AddLocalUrlResult = { ok: true; id: string } | { ok: false; error: string };

export function useLocalServers() {
  const { providers, addProvider, updateProvider, setSelectedProviderName } = useSettings();
  const saved = useMemo(() => savedLocalProviders(providers), [providers]);

  const query = useQuery({
    queryKey: queryKeys.localServers(savedTargetKeys(saved)),
    queryFn: () => detectLocalServers(saved),
    refetchOnWindowFocus: true,
  });

  const { refetch } = query;
  const rows: LocalRow[] = useMemo(() => localRows(query.data ?? [], providers), [query.data, providers]);

  /** Save a detected server as an active provider and select it. */
  const enable = useCallback((server: LocalServer) => {
    addProvider(toLocalProvider(server));
    setSelectedProviderName(server.id);
  }, [addProvider, setSelectedProviderName]);

  /** Re-probe, then bring each saved running server's model list up to date. */
  const rescan = useCallback(async () => {
    const { data } = await refetch();
    for (const row of localRows(data ?? [], providers)) {
      if (!row.saved || !row.running) continue;
      updateProvider(row.id, { models: syncModels(row.saved.models ?? [], row.modelIds) });
    }
  }, [refetch, providers, updateProvider]);

  /** Probe a user-typed address; save it when an OpenAI-compatible server answers. */
  const addUrl = useCallback(async (input: string): Promise<AddLocalUrlResult> => {
    const baseUrl = normalizeLocalUrl(input);
    if (!baseUrl) return { ok: false, error: `"${input}" isn't a valid address.` };

    const id = customServerId(baseUrl);
    if (saved.some((p) => p.provider === id)) {
      setSelectedProviderName(id);
      return { ok: true, id };
    }

    const modelIds = await probeModels(baseUrl);
    if (!modelIds) return { ok: false, error: `No OpenAI-compatible server answered at ${baseUrl}.` };

    enable({ id, baseUrl, running: true, modelIds });
    return { ok: true, id };
  }, [saved, enable, setSelectedProviderName]);

  return { rows, isScanning: query.isFetching, enable, rescan, addUrl };
}
