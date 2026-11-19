/** Every dictation, newest first, narrowed to those whose words contain `query`, with Delete (optimistic, rolled back on failure). */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { useToast } from '@shared/contexts/ToastContext';
import { DICTATIONS_CONFIG } from '@config/dictations.config';
import type { Dictation } from '@shared/types';

export function useDictations(query: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: all = [], isLoading } = useQuery({
    queryKey: queryKeys.dictations(),
    queryFn: async () => (await store.dictations.list(DICTATIONS_CONFIG.listLimit)).items,
    enabled: isTauriEnvironment(),
  });
  const dictations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? all.filter((d) => d.text.toLocaleLowerCase().includes(needle)) : all;
  }, [all, query]);

  const remove = useMutation({
    mutationFn: (id: string) => store.dictations.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.dictations() });
      const previous = queryClient.getQueryData<Dictation[]>(queryKeys.dictations());
      queryClient.setQueryData<Dictation[]>(queryKeys.dictations(), (old) => old?.filter((d) => d.id !== id));
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.dictations(), context.previous);
      console.error('[Dictations] Delete failed:', error);
      showToast('Couldn’t delete the dictation', 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.dictations() }),
  });

  return { dictations, hasAny: all.length > 0, isLoading, remove: remove.mutate };
}
