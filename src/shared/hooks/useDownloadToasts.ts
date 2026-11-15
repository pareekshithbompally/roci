/** Every web download ends in the "Save as…" toast (Show in Finder) or a plain error. Mount once. */

import { DOWNLOAD_FINISHED_EVENT } from '@config/window.config';
import { showToast } from '@shared/ui';
import { toastSavedFile } from '@shared/utils/savedFileToast';
import type { FinishedDownload } from '@services/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useDownloadToasts(): void {
  useTauriEvent<FinishedDownload>(DOWNLOAD_FINISHED_EVENT, ({ path, success }) => {
    if (success && path) toastSavedFile(path);
    else showToast('Couldn’t download the file', 'error');
  });
}
