/**
 * The toast after a "Save as…": where the file went, and a button that shows
 * it in Finder. One place for every export (meeting notes, chat tables).
 */

import { UI_CONFIG } from '@config/ui.config';
import { revealInFinder } from '@services/tauri';
import { showToast } from '@shared/ui';

export function toastSavedFile(path: string): void {
  showToast(`Saved to ${path}`, 'success', {
    label: 'Show in Finder',
    icon: UI_CONFIG.appIcons.finder,
    onClick: () => {
      revealInFinder(path).catch((error: unknown) => console.error('[toastSavedFile] Reveal failed:', error));
    },
  });
}
