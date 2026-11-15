/** Main window show/hide/toggle, always-on-top, minimize, maximize and center. */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriEnvironment } from './tauri';

class WindowService {
  private currentWindow: ReturnType<typeof getCurrentWindow> | null = null;
  private initialized = false;

  private getWindow(): ReturnType<typeof getCurrentWindow> | null {
    if (!isTauriEnvironment()) {
      return null;
    }

    if (!this.currentWindow) {
      try {
        this.currentWindow = getCurrentWindow();
      } catch (error) {
        console.error('Failed to access current window:', error);
        return null;
      }
    }

    return this.currentWindow;
  }

  /** Size and position persist via the Rust window-state plugin; this only handles visibility and always-on-top. */
  async initialize(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    if (this.initialized) {
      console.warn('Window service already initialized');
      return;
    }

    try {
      const currentWindow = this.getWindow();
      if (!currentWindow) {
        console.warn('Window service unavailable: no current window');
        return;
      }

      this.initialized = true;
      console.log('Window service initialized (state managed by tauri-plugin-window-state)');
    } catch (error) {
      console.error('Failed to initialize window service:', error);
    }
  }

  async show(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await invoke('show_window');
    } catch (error) {
      console.error('Failed to show window:', error);
      // Fallback
      await currentWindow.show();
      await currentWindow.setFocus();
    }
  }

  async hide(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await invoke('hide_window');
    } catch (error) {
      console.error('Failed to hide window:', error);
      // Fallback
      await currentWindow.hide();
    }
  }

  async toggle(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await invoke('toggle_window');
    } catch (error) {
      console.error('Failed to toggle window:', error);
      const isVisible = await currentWindow.isVisible();
      if (isVisible) {
        await this.hide();
      } else {
        await this.show();
      }
    }
  }

  async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await invoke('set_always_on_top', { alwaysOnTop });
    } catch (error) {
      console.error('Failed to set always on top:', error);
      await currentWindow.setAlwaysOnTop(alwaysOnTop);
    }
  }

  /** Native minimize to the Dock; close-to-tray hiding belongs to the Rust close handler. */
  async minimize(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await currentWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }

  async maximize(): Promise<void> {
    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await currentWindow.maximize();
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  }

  async center(): Promise<void> {
    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      await currentWindow.center();
    } catch (error) {
      console.error('Failed to center window:', error);
    }
  }
}

// Export singleton instance
export const windowService = new WindowService();
