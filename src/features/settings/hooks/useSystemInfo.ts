/** The storage folder and app version the General and Storage panels show: read once, when Settings opens. */

import { useQuery } from '@tanstack/react-query';
import { getVersion } from '@tauri-apps/api/app';
import { isTauriEnvironment } from '@services/tauri';
import { pathsService } from '@services/storage';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

interface SystemInfo {
  storagePath: string | null;
  storagePathError: string | null;
  appVersion: string;
}

const UNKNOWN: SystemInfo = { storagePath: null, storagePathError: null, appVersion: '' };

/** Each part stands alone: an unresolved folder or version is said so, not thrown. */
async function loadSystemInfo(): Promise<SystemInfo> {
  if (!isTauriEnvironment()) return UNKNOWN;
  const [storagePath, appVersion] = await Promise.all([
    pathsService.getBasePath().catch(() => null),
    getVersion().catch(() => 'unknown'),
  ]);
  return { storagePath, storagePathError: storagePath ? null : 'Unable to resolve storage location.', appVersion };
}

const systemInfoQuery = { queryKey: queryKeys.systemInfo(), queryFn: loadSystemInfo, staleTime: Infinity };

/** Starts the read while Settings is still on another panel, so the panels open with it. */
export const preloadSystemInfo = (): void => {
  queryClient.prefetchQuery(systemInfoQuery).catch((error: unknown) => console.error('[SystemInfo] Read failed:', error));
};

export const useSystemInfo = (): SystemInfo => useQuery(systemInfoQuery).data ?? UNKNOWN;
