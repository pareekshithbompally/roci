/**
 * llama.cpp React Query hooks
 *
 * All HuggingFace network reads go through TanStack Query: caching, dedup,
 * retry, and loading/error state come for free (queryClient defaults:
 * staleTime 30s, gc 5m, retry 1, no refetch-on-focus). Keys are sourced
 * from the @shared/query/queryKeys factory only.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import * as models from './models';
import type { HfModelResult, HfModelFile } from './types';

/** Debounced HF GGUF model search. Disabled when the query is empty. */
export function useHfModelSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<HfModelResult[]>({
    queryKey: queryKeys.hfModelSearch(trimmed),
    queryFn: () => models.searchHfModels(trimmed),
    enabled: trimmed.length > 0,
  });
}

/**
 * GGUF files for a repo, pre-sorted by quant (recommended → quality → size).
 * `hasToken` is part of the key so gated repos refetch when a token appears.
 */
export function useHfRepoFiles(repoId: string | null, hfToken?: string) {
  const token = hfToken?.trim() || undefined;
  return useQuery<HfModelFile[]>({
    queryKey: queryKeys.hfRepoFiles(repoId ?? '', !!token),
    queryFn: () => (repoId ? models.listHfRepoFiles(repoId, token) : Promise.resolve([])),
    enabled: !!repoId,
    select: (files) => models.sortFilesByQuant(files),
  });
}
