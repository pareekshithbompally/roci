/** The curated on-device models and their state (installed, downloading); refreshed on every download and delete. */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { getLocalModels } from '@services/localModels.service';

export function useLocalModels() {
  return useQuery({ queryKey: queryKeys.localModels(), queryFn: getLocalModels });
}
