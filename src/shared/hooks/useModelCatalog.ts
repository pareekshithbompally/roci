/** Loads the models.dev catalog once per run so components re-render when it arrives; returns whether loaded. */

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
