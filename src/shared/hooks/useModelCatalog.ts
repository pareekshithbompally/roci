/** Loads the models.dev catalog once per run so components re-render when it arrives (and again after a refresh). */

import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { queryClient } from '@shared/query/queryClient';
import { modalitiesService } from '@services/modalities';

/** When the catalog in memory was loaded (epoch ms), 0 when it isn't: a new value re-renders every reader. */
async function loadCatalog(): Promise<number> {
  await modalitiesService.ensureLoaded();
  return modalitiesService.isLoaded() ? Date.now() : 0;
}

export function useModelCatalog(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.modelCatalog(),
    queryFn: loadCatalog,
    staleTime: Infinity,
  });
  return (data ?? 0) > 0;
}

/** Settings › Storage › Model Catalog: fetch models.dev again now; every reader re-renders with it. Throws when offline. */
export function useRefreshModelCatalog() {
  return useMutation({
    mutationFn: async () => {
      if (!(await modalitiesService.fetchAndCache())) throw new Error('models.dev could not be reached');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.modelCatalog() }),
  });
}
