/**
 * Menubar service — thin frontend sync for the backend-owned tray.
 *
 * The tray icon, menu, visibility, and elapsed clock live in
 * `src-tauri/src/menubar.rs` (Hex-faithful owner). This service only:
 * - listens for `menubar-action` events (Show / Start / Stop / Quit), and
 * - reports recording transitions so the backend can swap the icon and
 *   retitle the Stop item.
 *
 * It never constructs tray icons, menus, images, or timers.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from './environment.service';
import { TrayAction } from './types';

export const MENUBAR_ACTION_EVENT = 'menubar-action';

export interface MenubarState {
  recording: boolean;
  paused: boolean;
  elapsedSecs: number;
  closeToTray: boolean;
  hideIcon: boolean;
}

type MenubarEventCallback = (action: TrayAction) => void;

class MenubarService {
  private unlisten: UnlistenFn | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /** Whether the menubar event listener is attached. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Attach the `menubar-action` listener. Concurrent calls (StrictMode
   * double-mount) share one in-flight attempt; a failed attempt resets so
   * a later call can retry.
   */
  initialize(onEvent: MenubarEventCallback): Promise<void> {
    if (!isTauriEnvironment()) return Promise.resolve();
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = listen<TrayAction>(MENUBAR_ACTION_EVENT, (event) => {
      onEvent(event.payload);
    }).then((unlisten) => {
      this.unlisten = unlisten;
      this.initialized = true;
    }).catch((error) => {
      console.error('[Menubar] Failed to attach menubar listener:', error);
      this.initPromise = null;
    });

    return this.initPromise;
  }

  /** Report a recording transition. Backend owns the icon and clock. */
  async setRecordingState(active: boolean, paused = false): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await invoke('menubar_set_recording_state', { active, paused });
    } catch (error) {
      console.error('[Menubar] Failed to report recording state:', error);
    }
  }

  /** Set the tray tooltip. */
  async setTooltip(tooltip: string): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await invoke('menubar_set_tooltip', { tooltip });
    } catch (error) {
      console.error('[Menubar] Failed to set tooltip:', error);
    }
  }

  /** Show or hide the icon (recording still forces it visible). */
  async setVisible(visible: boolean): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await invoke('menubar_set_visible', { visible });
    } catch (error) {
      console.error('[Menubar] Failed to set visibility:', error);
    }
  }

  /** Read backend menubar status for settings sync. */
  async getState(): Promise<MenubarState | null> {
    if (!isTauriEnvironment()) return null;
    try {
      return await invoke<MenubarState>('menubar_get_state');
    } catch (error) {
      console.error('[Menubar] Failed to read menubar state:', error);
      return null;
    }
  }

  /**
   * Quit through the single backend exit path (runs the existing
   * ExitRequested guard and cleanup).
   */
  async quit(): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await invoke('menubar_quit');
    } catch (error) {
      console.error('[Menubar] Failed to quit:', error);
    }
  }

  /** Detach the listener (test teardown / HMR). */
  destroy(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.initialized = false;
    this.initPromise = null;
  }
}

export const menubarService = new MenubarService();
