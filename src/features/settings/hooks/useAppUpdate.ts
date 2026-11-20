/** App updates in the webview: Rust checks and installs (updates.rs); here its state becomes one tray row, and Check for
 *  Updates ends with a toast. */

import { useCallback, useEffect } from 'react';
import { isTauriEnvironment, openUrl, updatesService, type UpdateState } from '@services/tauri';
import { activityStore, type ActivityItem } from '@shared/stores/activityStore';
import { useUpdateChecking, useUpdateDeferred, useUpdateState, useUpdateStore } from '@features/settings/stores/updateStore';
import { APP_CONFIG } from '@config/app.config';
import { platform } from '@platform/index';
import { formatFileSize } from '@shared/utils/formatters';
import { showToast } from '@shared/ui';

const ACTIVITY_ID = 'app-update';

type UpdateRow = Pick<ActivityItem, 'label' | 'status'> & Partial<ActivityItem>;

const openReleaseNotes = () => void openUrl(APP_CONFIG.releasesUrl);

/** Install; a refusal (e.g. while recording) or failure says why. */
function install(): void {
  updatesService.install().catch((error: unknown) => {
    console.error('[useAppUpdate] Install failed:', error);
    showToast(typeof error === 'string' ? error : 'Could not install the update', 'error');
  });
}

const later = (version: string) => () => useUpdateStore.setState({ deferred: version });

function downloadDetail(downloaded: number, total: number | null): string {
  return total ? `${formatFileSize(downloaded)} / ${formatFileSize(total)}` : formatFileSize(downloaded);
}

/** The tray row for `state`, or null when there's nothing to show. */
function rowFor(state: UpdateState, deferred: string | null): UpdateRow | null {
  switch (state.status) {
    case 'available':
      return state.version === deferred ? null : {
        label: `Roci v${state.version} available`,
        status: 'waiting',
        actions: [
          { icon: 'external-link', label: 'Release notes', onClick: openReleaseNotes },
          { icon: 'download', label: 'Update now', onClick: install },
          { icon: 'x', label: 'Later', onClick: later(state.version) },
        ],
      };
    case 'downloading':
      return {
        label: `Updating to v${state.version}`,
        status: 'active',
        percent: state.total ? Math.round((state.downloaded / state.total) * 100) : null,
        detail: downloadDetail(state.downloaded, state.total),
        actions: [],
      };
    case 'installing':
      return { label: `Updating to v${state.version}`, status: 'complete', percent: 100, detail: 'Installing…', actions: [] };
    case 'failed':
      return {
        label: `Roci v${state.version} didn't install`,
        status: 'error',
        error: state.error,
        detail: null,
        percent: null,
        actions: [
          { icon: 'download', label: 'Try again', onClick: install },
          { icon: 'x', label: 'Later', onClick: later(state.version) },
        ],
      };
    case 'idle':
      return null;
  }
}

function showRow(row: UpdateRow | null): void {
  if (!row) return activityStore.remove(ACTIVITY_ID);
  if (activityStore.get(ACTIVITY_ID)) return activityStore.update(ACTIVITY_ID, row);
  activityStore.add({ id: ACTIVITY_ID, type: 'download', percent: null, step: null, detail: null, error: null, actions: [], ...row });
}

/** Mount once (App): mirrors Rust's update state into the store and the tray row. */
export function useUpdateRuntime(): void {
  const state = useUpdateState();
  const deferred = useUpdateDeferred();

  useEffect(() => {
    if (!platform.hasUpdater || !isTauriEnvironment()) return;
    const apply = (next: UpdateState) => useUpdateStore.setState({ state: next });
    const stop = updatesService.onState(apply);
    // A check that finished before this listener existed.
    updatesService.current().then(apply).catch((error: unknown) =>
      console.error('[useUpdateRuntime] Reading update state failed:', error));
    return stop;
  }, []);

  useEffect(() => showRow(rowFor(state, deferred)), [state, deferred]);
}

const CHECK_TOAST = {
  available: { message: 'An update is available', tone: 'info' },
  current: { message: 'Roci is up to date', tone: 'success' },
  failed: { message: 'Could not check for updates', tone: 'error' },
} as const;

/** Check for Updates (Settings › General, menu bar): runs now and says the outcome. */
export function useAppUpdate(): { checking: boolean; checkNow: () => Promise<void> } {
  const checking = useUpdateChecking();

  const checkNow = useCallback(async () => {
    useUpdateStore.setState({ checking: true, deferred: null });
    try {
      const state = await updatesService.check();
      // Anything but idle is an update on its way (offered, downloading or waiting to retry).
      const { message, tone } = CHECK_TOAST[state.status === 'idle' ? 'current' : 'available'];
      showToast(message, tone);
    } catch (error: unknown) {
      console.error('[useAppUpdate] Check failed:', error);
      showToast(CHECK_TOAST.failed.message, CHECK_TOAST.failed.tone);
    } finally {
      useUpdateStore.setState({ checking: false });
    }
  }, []);

  return { checking, checkNow };
}
