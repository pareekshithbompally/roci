/** A kept file's URL through Tauri's asset protocol (cached per path), null once its row is gone, undefined while it
 *  resolves; nothing for no path. Chat media and Knowledge documents load their files through it. */

import { useQuery } from '@tanstack/react-query';
import { assetsService } from '@services/storage';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';

async function keptFileUrl(appPath: string): Promise<string | null> {
  return (await store.assets.exists(appPath)) ? assetsService.fileUrl(appPath) : null;
}

export function useKeptFileUrl(appPath: string | null): string | null | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.appFileUrl(appPath ?? ''),
    queryFn: () => keptFileUrl(appPath ?? ''),
    enabled: appPath !== null,
    staleTime: Infinity,
  });
  return data;
}
