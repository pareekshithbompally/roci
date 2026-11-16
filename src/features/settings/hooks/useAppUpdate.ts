/** App update lifecycle (check → offer → download → install → relaunch) as one ActivityTray row, from "available" to "installing". */

import { useState, useCallback, useRef, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { isTauriEnvironment } from '@services/tauri';
import { activityStore, type ActivityItem } from '@shared/stores/activityStore';
import { APP_CONFIG } from '@config/app.config';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

/** What a completed check found; the tray's toast reads it. */
export type UpdateCheckResult = 'available' | 'current' | 'failed';

interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

export interface UpdateCheckOptions {
  /** Treat an unreachable endpoint as "no update" (it 404s until the first release with updater artifacts). */
  silent?: boolean;
}

interface UseAppUpdateReturn {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  error: string | null;
  /** Returns true if an update is available, false if already up-to-date. */
  checkForUpdate: (options?: UpdateCheckOptions) => Promise<boolean>;
  /** Check now and report the outcome (tray's Check for Updates…). */
  checkNow: (options?: UpdateCheckOptions) => Promise<UpdateCheckResult>;
  downloadAndInstall: () => Promise<void>;
  dismiss: () => void;
}

const ACTIVITY_ID = 'app-update';
const STARTUP_CHECK_DELAY_MS = 10_000;

/** The update's tray row: patched in place as it moves from offered to downloading to installing. */
function putUpdateRow(fields: Pick<ActivityItem, 'label' | 'status'> & Partial<ActivityItem>): void {
  if (activityStore.get(ACTIVITY_ID)) {
    activityStore.update(ACTIVITY_ID, fields);
    return;
  }
  activityStore.add({ id: ACTIVITY_ID, type: 'download', percent: null, step: null, detail: null, error: null, actions: [], ...fields });
}

function openReleaseNotes(): void {
  open(APP_CONFIG.releasesUrl).catch((error: unknown) => console.error('[useAppUpdate] Open release notes failed:', error));
}

/** Imported dynamically so non-Tauri environments don't crash on import. */
async function getUpdaterPlugins() {
  const [{ check }, { relaunch }] = await Promise.all([
    import('@tauri-apps/plugin-updater'),
    import('@tauri-apps/plugin-process'),
  ]);
  return { check, relaunch };
}

export function useAppUpdate(): UseAppUpdateReturn {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater')['check']>>>(null);

  const runCheck = useCallback(async (options?: UpdateCheckOptions): Promise<UpdateCheckResult> => {
    if (!isTauriEnvironment()) return 'failed';

    setStatus('checking');
    setError(null);

    try {
      const { check } = await getUpdaterPlugins();
      const update = await check();

      if (update?.available) {
        updateRef.current = update;
        setUpdateInfo({
          version: update.version,
          body: update.body ?? null,
          date: update.date ?? null,
        });
        setStatus('available');
        return 'available';
      } else {
        setStatus('idle');
        setUpdateInfo(null);
        return 'current';
      }
    } catch (err: unknown) {
      if (options?.silent) {
        console.debug('[useAppUpdate] Background check failed, treating as up-to-date:', err);
        setStatus('idle');
        setUpdateInfo(null);
        return 'current';
      }
      console.error('[useAppUpdate] Check failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
      setStatus('error');
      return 'failed';
    }
  }, []);

  const checkForUpdate = useCallback(
    async (options?: UpdateCheckOptions): Promise<boolean> =>
      (await runCheck(options)) === 'available',
    [runCheck],
  );

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    setStatus('downloading');

    // The offered row becomes the download's progress row.
    putUpdateRow({
      label: `Updating to v${update.version}`,
      status: 'active',
      percent: 0,
      detail: 'Starting download…',
      actions: [],
    });

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0;
          activityStore.update(ACTIVITY_ID, {
            detail: totalBytes ? formatBytes(totalBytes) : 'Downloading…',
          });
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : null;
          activityStore.update(ACTIVITY_ID, {
            percent,
            detail: totalBytes
              ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
              : formatBytes(downloadedBytes),
          });
        } else if (event.event === 'Finished') {
          activityStore.update(ACTIVITY_ID, {
            status: 'complete',
            percent: 100,
            detail: 'Installing…',
          });
        }
      });

      setStatus('ready');

      // Brief pause so user sees "Installing…" then relaunch
      setTimeout(async () => {
        activityStore.remove(ACTIVITY_ID);
        try {
          const { relaunch } = await getUpdaterPlugins();
          await relaunch();
        } catch (err: unknown) {
          console.error('[useAppUpdate] Relaunch failed:', err);
        }
      }, 1_500);

    } catch (err: unknown) {
      console.error('[useAppUpdate] Download failed:', err);
      setError(err instanceof Error ? err.message : 'Download failed');
      setStatus('error');
      activityStore.update(ACTIVITY_ID, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Download failed',
        detail: null,
        percent: null,
      });
      // Clean up activity row after a delay
      setTimeout(() => activityStore.remove(ACTIVITY_ID), 5_000);
    }
  }, []);

  const dismiss = useCallback(() => {
    activityStore.remove(ACTIVITY_ID);
    setStatus('idle');
    setUpdateInfo(null);
    updateRef.current = null;
  }, []);

  // An update found by a check is offered in the tray: Release notes, Update now, Later.
  useEffect(() => {
    if (status !== 'available' || !updateInfo) return;
    putUpdateRow({
      label: `Kasset v${updateInfo.version} available`,
      status: 'waiting',
      actions: [
        { icon: 'external-link', label: 'Release notes', onClick: openReleaseNotes },
        { icon: 'download', label: 'Update now', onClick: () => void downloadAndInstall() },
        { icon: 'x', label: 'Later', onClick: dismiss },
      ],
    });
  }, [status, updateInfo, downloadAndInstall, dismiss]);

  return { status, updateInfo, error, checkForUpdate, checkNow: runCheck, downloadAndInstall, dismiss };
}

/** Schedule a background update check after app startup settles. */
export function scheduleStartupCheck(checkFn: () => Promise<void>) {
  if (!isTauriEnvironment()) return;
  // Dev builds can never be served by the updater, so skip instead of logging an error every launch.
  if (import.meta.env.DEV) return;
  const timer = setTimeout(checkFn, STARTUP_CHECK_DELAY_MS);
  return () => clearTimeout(timer);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
