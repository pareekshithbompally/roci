/** Detected local servers merged with saved ones, plus switch on, rescan and add-by-URL; re-probes on focus. */

import { useCallback, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import {
  customServerId,
  listServerModels,
  localRows,
  needsHttps,
  normalizeLocalUrl,
  savedLocalProviders,
  syncModels,
  toLocalProvider,
} from '@services/providers/localServers';
import { useLocalServerProbe } from './useLocalServerProbe';
import { LOCAL_NEEDS_HTTPS, SERVER_APP_BY_LIST_STYLE } from '@config/localServers.config';
import { listStyleOf } from '@services/providers/listers';
import type { LocalRow, LocalServer } from '@services/providers/localServers';

export type AddLocalUrlResult = { ok: true; id: string } | { ok: false; error: string };

export function useLocalServers() {
  const { providers, addProvider, updateProvider, setSelectedProviderName } = useSettings();
  const saved = useMemo(() => savedLocalProviders(providers), [providers]);

  const query = useLocalServerProbe();

  const { refetch } = query;
  const rows: LocalRow[] = useMemo(() => localRows(query.data ?? [], providers), [query.data, providers]);

  /** Save a detected server as an active provider and select it. */
  const enable = useCallback((server: LocalServer, serverApp?: string) => {
    addProvider(toLocalProvider(server, serverApp));
    setSelectedProviderName(server.id);
  }, [addProvider, setSelectedProviderName]);

  /** Re-probe, then bring each saved running server's model list up to date. */
  const rescan = useCallback(async () => {
    const { data } = await refetch();
    for (const row of localRows(data ?? [], providers)) {
      if (!row.saved || !row.running) continue;
      updateProvider(row.id, { models: syncModels(row.saved.models ?? [], row.models) });
    }
  }, [refetch, providers, updateProvider]);

  /** Probe a user-typed address (this device's over http, any other over https); save it when a server answers. */
  const addUrl = useCallback(async (input: string): Promise<AddLocalUrlResult> => {
    const baseUrl = normalizeLocalUrl(input);
    if (!baseUrl) return { ok: false, error: `"${input}" isn't a valid address.` };
    if (needsHttps(baseUrl)) return { ok: false, error: LOCAL_NEEDS_HTTPS };

    const id = customServerId(baseUrl);
    if (saved.some((p) => p.provider === id)) {
      setSelectedProviderName(id);
      return { ok: true, id };
    }

    const models = await listServerModels(id, baseUrl);
    if (!models) return { ok: false, error: `No OpenAI-compatible server answered at ${baseUrl}.` };

    // The list just read settled its format, so this asks the server nothing more.
    const serverApp = SERVER_APP_BY_LIST_STYLE[await listStyleOf(id, { baseUrl })];
    enable({ id, baseUrl, running: true, models }, serverApp);
    return { ok: true, id };
  }, [saved, enable, setSelectedProviderName]);

  return { rows, isScanning: query.isFetching, enable, rescan, addUrl };
}
