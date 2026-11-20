/** Settings › Storage data: counts and sizes from disk, the Keep policy, and Delete All / Clear Cache. */

import { useMutation, useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { cacheService } from '@services/storage';
import { retentionService } from '@services/storage/retention.service';
import { isTauriEnvironment } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { RetentionClass } from '@shared/types';
import type { StorageUsage } from '@shared/types/native';

/** What a Storage action empties: one class, or the cache. */
export type StorageTarget = RetentionClass | 'cache';

export function useStorageUsage() {
  return useQuery({
    queryKey: queryKeys.storageUsage(),
    queryFn: () => store.storage.usage(),
    enabled: isTauriEnvironment(),
  });
}

/** One class's Keep period in days; undefined = Forever. Choosing Forever removes the class from the policy. */
export function useKeepPeriod(target: RetentionClass): [number | undefined, (days: number | undefined) => void] {
  const { settings, setSettings } = useSettings();
  const policy = settings.storageRetention ?? {};
  const setDays = (days: number | undefined) => {
    const { [target]: _old, ...rest } = policy;
    setSettings({ storageRetention: days === undefined ? rest : { ...rest, [target]: days } });
  };
  return [policy[target], setDays];
}

async function clearCache(): Promise<void> {
  const result = await cacheService.clearAll();
  if (!result.success) throw new Error(result.error);
}

/** The figures with `target` emptied, shown until the store's own figures arrive. */
function emptied(usage: StorageUsage, target: StorageTarget): StorageUsage {
  if (target === 'cache') return { ...usage, cache_bytes: 0 };
  if (target === 'meetings' || target === 'chats' || target === 'dictations') return { ...usage, [target]: 0 };
  return { ...usage, assets: usage.assets.filter((entry) => entry.kind !== target) };
}

/** Delete All for a class, or Clear Cache: optimistic on the figures, rolled back when it fails. */
export function useStorageClear() {
  return useMutation<void, Error, StorageTarget, { previous?: StorageUsage }>({
    mutationFn: (target) => (target === 'cache' ? clearCache() : retentionService.clear(target)),
    onMutate: async (target) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storageUsage() });
      const previous = queryClient.getQueryData<StorageUsage>(queryKeys.storageUsage());
      if (previous) queryClient.setQueryData(queryKeys.storageUsage(), emptied(previous, target));
      return { previous };
    },
    onError: (_error, _target, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.storageUsage(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.storageUsage() }),
  });
}
