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
export type ProbeUrlResult = { ok: true; server: LocalServer; serverApp?: string } | { ok: false; error: string };

export function useLocalServers() {
  const { providers, addProvider, updateProvider } = useSettings();
  const saved = useMemo(() => savedLocalProviders(providers), [providers]);

  const query = useLocalServerProbe();

  const { refetch } = query;
  const rows: LocalRow[] = useMemo(() => localRows(query.data ?? [], providers), [query.data, providers]);

  /** Save a detected server as an active provider. */
  const enable = useCallback((server: LocalServer, serverApp?: string) => {
    addProvider(toLocalProvider(server, serverApp));
  }, [addProvider]);

  /** Re-probe, then bring each saved running server's model list up to date. */
  const rescan = useCallback(async () => {
    const { data } = await refetch();
    for (const row of localRows(data ?? [], providers)) {
      if (!row.saved || !row.running) continue;
      updateProvider(row.id, { models: syncModels(row.saved.models ?? [], row.models) });
    }
  }, [refetch, providers, updateProvider]);

  /** Ask a user-typed address (this device's over http, any other over https) for its models; nothing is saved. */
  const probeUrl = useCallback(async (input: string): Promise<ProbeUrlResult> => {
    const baseUrl = normalizeLocalUrl(input);
    if (!baseUrl) return { ok: false, error: `"${input}" isn't a valid address.` };
    if (needsHttps(baseUrl)) return { ok: false, error: LOCAL_NEEDS_HTTPS };

    const id = customServerId(baseUrl);
    const models = await listServerModels(id, baseUrl);
    if (!models) return { ok: false, error: `No OpenAI-compatible server answered at ${baseUrl}.` };

    // The list just read settled its format, so this asks the server nothing more.
    const serverApp = SERVER_APP_BY_LIST_STYLE[await listStyleOf(id, { baseUrl })];
    return { ok: true, server: { id, baseUrl, running: true, models }, serverApp };
  }, []);

  /** Save a user-typed address when a server answers; one already saved is left as it is. */
  const addUrl = useCallback(async (input: string): Promise<AddLocalUrlResult> => {
    const baseUrl = normalizeLocalUrl(input);
    const known = baseUrl && saved.find((p) => p.provider === customServerId(baseUrl));
    if (known) return { ok: true, id: known.provider };

    const result = await probeUrl(input);
    if ('error' in result) return result;
    enable(result.server, result.serverApp);
    return { ok: true, id: result.server.id };
  }, [saved, probeUrl, enable]);

  return { rows, isScanning: query.isFetching, enable, rescan, probeUrl, addUrl };
}
