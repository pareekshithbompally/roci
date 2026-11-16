/** The toast after any "Save as…": where the file went, with Show in Finder where there is one. */

import { UI_CONFIG } from '@config/ui.config';
import { revealInFinder } from '@services/tauri';
import { showToast } from '@shared/ui';
import { platform } from '@platform/index';

export function toastSavedFile(path: string): void {
  showToast(`Saved to ${path}`, 'success', platform.hasFileManager ? {
    label: 'Show in Finder',
    icon: UI_CONFIG.appIcons.finder,
    onClick: () => {
      revealInFinder(path).catch((error: unknown) => console.error('[toastSavedFile] Reveal failed:', error));
    },
  } : undefined);
}
