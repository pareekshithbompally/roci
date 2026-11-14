/**
 * useModelCatalog
 *
 * Loads the models.dev catalog (disk cache, else network) once per app run.
 * `capabilitiesOf()` and pricing read it synchronously; components call this
 * hook so they re-render when it arrives. Returns whether it has loaded.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { modalitiesService } from '@services/modalities';

async function loadCatalog(): Promise<boolean> {
  await modalitiesService.ensureLoaded();
  return modalitiesService.isLoaded();
}

export function useModelCatalog(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.modelCatalog(),
    queryFn: loadCatalog,
    staleTime: Infinity,
  });
  return data ?? false;
}
