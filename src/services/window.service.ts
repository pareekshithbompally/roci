/** The main window: show, hide, and native focus changes. Close-to-menu-bar hiding belongs to the Rust close handler. */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriEnvironment } from './tauri';

/** The window this webview runs in; none outside the app (a browser preview, a test). */
function mainWindow(): ReturnType<typeof getCurrentWindow> | null {
  if (!isTauriEnvironment()) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export const windowService = {
  /** Brings the window to the front. */
  async show(): Promise<void> {
    const window = mainWindow();
    if (!window) return;
    await window.show();
    await window.setFocus();
  },

  async hide(): Promise<void> {
    await mainWindow()?.hide();
  },

  /** Native key-window changes (the app returning from System Settings, say); returns the unsubscribe. */
  onFocusChanged(handler: (focused: boolean) => void): () => void {
    const window = mainWindow();
    if (!window) return () => undefined;
    const unlisten = window.onFocusChanged(({ payload }) => handler(payload));
    unlisten.catch((error: unknown) => console.error('[WindowService] focus listener failed:', error));
    return () => {
      unlisten.then((stop) => stop()).catch(() => undefined);
    };
  },
};
