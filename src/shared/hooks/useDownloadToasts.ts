/**
 * useDownloadToasts — every web download (code blocks, tables, diagrams,
 * images) ends in the same toast as a "Save as…": where it went, with Show in
 * Finder; or a plain error. Mount once.
 */

import { useEffect } from 'react';
import { onDownloadFinished } from '@services/tauri';
import { showToast } from '@shared/ui';
import { toastSavedFile } from '@shared/utils/savedFileToast';

export function useDownloadToasts(): void {
  useEffect(() => onDownloadFinished(({ path, success }) => {
    if (success && path) toastSavedFile(path);
    else showToast('Couldn’t download the file', 'error');
  }), []);
}
