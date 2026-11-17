/** Files shown in Finder: the toast after any "Save as…", and Show in Finder with its own failure toast. */

import { UI_CONFIG } from '@config/ui.config';
import { revealInFinder } from '@services/tauri';
import { showToast } from '@shared/ui';
import { platform } from '@platform/index';

/** One label for the action everywhere it appears. */
export const SHOW_IN_FINDER = 'Show in Finder';

/** Selects the file in Finder; says so when it can't. */
export function showInFinder(path: string): void {
  revealInFinder(path).catch((error: unknown) => {
    console.error('[showInFinder] Reveal failed:', error);
    showToast("Couldn't show the file in Finder", 'error');
  });
}

export function toastSavedFile(path: string): void {
  showToast(`Saved to ${path}`, 'success', platform.hasFileManager ? {
    label: SHOW_IN_FINDER,
    icon: UI_CONFIG.appIcons.finder,
    onClick: () => showInFinder(path),
  } : undefined);
}
