/**
 * The one probe of local servers (cached, re-run on focus): what's running and what each serves. While mounted
 * it keeps saved models' server-reported info (context, modalities) current; used by Settings and the model picker.
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import {
  detectLocalServers,
  localRows,
  refreshServedInfo,
  savedLocalProviders,
  savedTargetKeys,
} from '@services/providers/localServers';

export function useLocalServerProbe() {
  const { providers, updateProvider } = useSettings();
  const saved = useMemo(() => savedLocalProviders(providers), [providers]);

  const query = useQuery({
    queryKey: queryKeys.localServers(savedTargetKeys(saved)),
    queryFn: () => detectLocalServers(saved),
    refetchOnWindowFocus: true,
  });

  // Each probe refreshes what servers report about saved models; writes only when it changed.
  useEffect(() => {
    for (const row of localRows(query.data ?? [], providers)) {
      if (!row.saved || !row.running) continue;
      const current = row.saved.models ?? [];
      const refreshed = refreshServedInfo(current, row.models);
      if (JSON.stringify(refreshed) !== JSON.stringify(current)) updateProvider(row.id, { models: refreshed });
    }
  }, [query.data, providers, updateProvider]);

  return query;
}
