/** Every dictation, newest first and grouped by day, with Delete (optimistic, rolled back on failure). */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { useToast } from '@shared/contexts/ToastContext';
import { formatDayLabel, groupByLabel } from '@shared/utils/formatters';
import { DICTATIONS_CONFIG } from '@config/dictations.config';
import type { Dictation } from '@shared/types';

export function useDictations() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: dictations = [], isLoading } = useQuery({
    queryKey: queryKeys.dictations(),
    queryFn: async () => (await store.dictations.list(DICTATIONS_CONFIG.listLimit)).items,
    enabled: isTauriEnvironment(),
  });
  const days = useMemo(() => groupByLabel(dictations, (d) => formatDayLabel(d.createdAt)), [dictations]);

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

  return { dictations, days, isLoading, remove: remove.mutate };
}
