/** The memory llama.cpp projects for a downloaded chat model at each context size and KV cache type asked for (its own
 *  measure, without loading the weights); a figure never changes for a model file, so each is measured once. */

import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { projectedModelMemory } from '@services/localModels.service';
import { isTauriEnvironment } from '@services/tauri';
import type { KvType } from '@config/personalization.config';

export interface MemoryAsk {
  tokens: number;
  kvType: KvType;
}

/** Bytes for each ask, in order; undefined until measured (or when it can't be). */
export function useModelMemory(modelId: string, asks: readonly MemoryAsk[]): Array<number | undefined> {
  return useQueries({
    queries: asks.map(({ tokens, kvType }) => ({
      queryKey: queryKeys.modelMemory(modelId, tokens, kvType),
      queryFn: () => projectedModelMemory(modelId, tokens, kvType),
      enabled: isTauriEnvironment(),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
    combine: (results) => results.map((result) => result.data),
  });
}
