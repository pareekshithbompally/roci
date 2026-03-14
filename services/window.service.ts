/**
 * Window Management Service
 * 
 * Handles window state persistence, positioning, and behavior.
 */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { 
  WindowState,
  DEFAULT_WINDOW_CONFIG,
  DEFAULT_WINDOW_STATE,
  mergeWindowState,
  validateDimensions,
  validatePosition,
  WINDOW_STATE_KEY
} from '../src/config/window.config';
import { settingsService } from './storage/settings.service';
import { isTauriEnvironment } from './tauri';

class WindowService {
  private saveTimeout: NodeJS.Timeout | null = null;
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

  /**
   * Initialize window management
   * Restores saved window state and sets up event listeners
   */
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

      // Restore saved window state
      await this.restoreWindowState();

      // Set up event listeners for window changes
      this.setupEventListeners();

      this.initialized = true;
      console.log('Window service initialized');
    } catch (error) {
      console.error('Failed to initialize window service:', error);
      // Non-critical error, continue anyway
    }
  }

  /**
   * Get current window state from Tauri
   */
  async getCurrentState(): Promise<WindowState> {
    if (!isTauriEnvironment()) {
      return DEFAULT_WINDOW_STATE;
    }

    try {
      return await invoke<WindowState>('get_window_state');
    } catch (error) {
      console.error('Failed to get window state:', error);
      throw error;
    }
  }

  /**
   * Save current window state
   */
  async saveState(state?: WindowState): Promise<void> {
    try {
      const stateToSave = state || await this.getCurrentState();

      // Validate state
      if (!validateDimensions(stateToSave.width, stateToSave.height)) {
        console.warn('Invalid window dimensions, skipping save');
        return;
      }

      if (!validatePosition(stateToSave.x, stateToSave.y)) {
        console.warn('Invalid window position, skipping save');
        return;
      }

      // Save to settings
      const settingsResult = await settingsService.load();
      if (settingsResult.success && settingsResult.data) {
        settingsResult.data[WINDOW_STATE_KEY] = stateToSave;
        await settingsService.save(settingsResult.data);
        console.log('Window state saved:', stateToSave);
      }
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }

  /**
   * Save window state with debounce
   */
  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.saveState();
      this.saveTimeout = null;
    }, DEFAULT_WINDOW_CONFIG.stateSave.debounceMs);
  }

  /**
   * Restore saved window state
   */
  async restoreWindowState(): Promise<void> {
    try {
      const currentWindow = this.getWindow();
      if (!currentWindow) {
        return;
      }

      const settingsResult = await settingsService.load();
      
      if (!settingsResult.success || !settingsResult.data) {
        console.log('No saved window state found, using defaults');
        return;
      }
      
      const savedState = settingsResult.data[WINDOW_STATE_KEY] as Partial<WindowState> | undefined;

      if (!savedState) {
        console.log('No saved window state found, using defaults');
        return;
      }

      const state = mergeWindowState(savedState, DEFAULT_WINDOW_STATE);

      // Restore window state
      if (DEFAULT_WINDOW_CONFIG.stateSave.savePosition) {
        await currentWindow.setPosition(new LogicalPosition(state.x, state.y));
      }

      if (DEFAULT_WINDOW_CONFIG.stateSave.saveSize) {
        await currentWindow.setSize(new LogicalSize(state.width, state.height));
      }

      if (DEFAULT_WINDOW_CONFIG.stateSave.saveMaximized && state.maximized) {
        await currentWindow.maximize();
      }

      if (DEFAULT_WINDOW_CONFIG.stateSave.saveFullscreen && state.fullscreen) {
        await currentWindow.setFullscreen(true);
      }

      console.log('Window state restored:', state);
    } catch (error) {
      console.error('Failed to restore window state:', error);
    }
  }

  /**
   * Set up event listeners for window state changes
   */
  private setupEventListeners(): void {
    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    // Listen for window resize
    currentWindow.onResized(() => {
      if (DEFAULT_WINDOW_CONFIG.stateSave.saveSize) {
        this.debouncedSave();
      }
    });

    // Listen for window move
    currentWindow.onMoved(() => {
      if (DEFAULT_WINDOW_CONFIG.stateSave.savePosition) {
        this.debouncedSave();
      }
    });

    // Note: Tauri v2 may have different event names, adjust as needed
  }

  /**
   * Show and focus the window
   */
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

  /**
   * Hide the window
   */
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

  /**
   * Toggle window visibility
   */
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

  /**
   * Set window to always on top
   */
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

  /**
   * Minimize window
   */
  async minimize(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = this.getWindow();
    if (!currentWindow) {
      return;
    }

    try {
      if (DEFAULT_WINDOW_CONFIG.behavior.minimizeToTray) {
        await this.hide();
      } else {
        await currentWindow.minimize();
      }
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }

  /**
   * Maximize window
   */
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

  /**
   * Center window on screen
   */
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
