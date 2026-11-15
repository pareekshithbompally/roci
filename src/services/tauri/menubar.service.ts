/** Frontend sync for the Rust-owned tray: menu actions in; recording state and downloaded Hex models out. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from './environment.service';
import type { TrayAction } from './types';

export const MENUBAR_ACTION_EVENT = 'menubar-action';

export interface MenubarState {
  recording: boolean;
  paused: boolean;
  elapsedSecs: number;
  closeToTray: boolean;
  hideIcon: boolean;
}

/** One row of the tray's Speech Model submenu (a downloaded Hex model). */
export interface MenubarSpeechModel {
  id: string;
  name: string;
  /** The model transcription currently uses; the tray checks it. */
  selected: boolean;
}

/** Menu ids are fixed actions or `speech_model:<id>`, so the payload is a plain string. */
type MenubarAction = TrayAction | string;
type MenubarEventCallback = (action: MenubarAction) => void;

class MenubarService {
  private unlisten: UnlistenFn | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private markListening: () => void = () => {};
  private readonly listening = new Promise<void>((resolve) => { this.markListening = resolve; });

  /** Resolves once the `menubar-action` listener is attached (URL actions wait for it). */
  whenListening(): Promise<void> {
    return this.listening;
  }

  /** Whether the menubar event listener is attached. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Attaches the listener once; concurrent calls share the attempt, and a failure resets so a later call can retry. */
  initialize(onEvent: MenubarEventCallback): Promise<void> {
    if (!isTauriEnvironment()) return Promise.resolve();
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = listen<string>(MENUBAR_ACTION_EVENT, (event) => {
      onEvent(event.payload);
    }).then((unlisten) => {
      this.unlisten = unlisten;
      this.initialized = true;
      this.markListening();
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

  /** Replaces the Speech Model submenu; an empty list shows the disabled "No downloaded models" row. */
  async setSpeechModels(models: MenubarSpeechModel[]): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await invoke('menubar_set_speech_models', { models });
    } catch (error) {
      console.error('[Menubar] Failed to report speech models:', error);
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

  /** Quits through the single backend exit path, which runs its guard and cleanup. */
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
