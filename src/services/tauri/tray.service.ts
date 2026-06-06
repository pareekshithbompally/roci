/**
 * System tray service for Tauri
 * Manages system tray icon, menu, and click interactions.
 *
 * Uses a MenuItem registry (Map<string, MenuItem>) so updateMenuItem()
 * can look up items directly — no getMenu() calls (which don't exist in Tauri v2).
 *
 * Recording state: swaps to a red-stroked waveform icon (non-template so macOS
 * renders the actual red color) and shows elapsed time in the "Stop Recording"
 * menu item text. No menu-bar title text or dots.
 */

import { APP_CONFIG } from '@config/app.config';
import { isTauriEnvironment } from './environment.service';
import { TrayAction } from './types';

type TrayEventCallback = (action: TrayAction) => void;

class TrayService {
  private eventCallback: TrayEventCallback | null = null;
  private trayHandle: any = null;
  private menuHandle: any = null;
  private itemRegistry: Map<string, any> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Icons
  private templateIcon: any = null;
  private recordingIcon: any = null;

  // Recording timer state
  private menuTimerInterval: ReturnType<typeof setInterval> | null = null;
  private recordingStartWallTime: number = 0;
  private pausedAccumulator: number = 0;
  private pauseStartTime: number = 0;

  /** Whether the tray has been successfully initialized */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize system tray with icon and menu.
   * Uses a stored promise so concurrent calls (StrictMode double-mount)
   * all await the same initialization instead of creating duplicate trays.
   */
  async initialize(onEvent: TrayEventCallback): Promise<void> {
    if (!isTauriEnvironment()) return;

    this.eventCallback = onEvent;

    // Already done
    if (this.initialized) return;

    // Already in-flight — wait for the first call to finish
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      const { TrayIcon } = await import('@tauri-apps/api/tray');
      const { Menu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
      const { resolveResource } = await import('@tauri-apps/api/path');
      const { Image } = await import('@tauri-apps/api/image');
      const { getVersion } = await import('@tauri-apps/api/app');

      // --- Menu items ---
      const version = await getVersion();

      const aboutItem = await PredefinedMenuItem.new({
        item: {
          About: {
            name: 'Kasset',
            version,
            copyright: 'Copyright © 2026 Kasset.ai. All rights reserved.',
          },
        },
      });

      const sep0 = await PredefinedMenuItem.new({ item: 'Separator' });

      const showItem = await MenuItem.new({
        id: 'show',
        text: 'Show Kasset.ai',
        action: () => this.handleEvent(TrayAction.SHOW),
      });

      const sep1 = await PredefinedMenuItem.new({ item: 'Separator' });

      const startRecordingItem = await MenuItem.new({
        id: 'start_recording',
        text: 'Start Recording',
        action: () => this.handleEvent(TrayAction.START_RECORDING),
      });

      const stopRecordingItem = await MenuItem.new({
        id: 'stop_recording',
        text: 'Stop Recording',
        enabled: false,
        action: () => this.handleEvent(TrayAction.STOP_RECORDING),
      });

      const sep2 = await PredefinedMenuItem.new({ item: 'Separator' });

      const quitItem = await MenuItem.new({
        id: 'quit',
        text: 'Quit',
        action: () => this.handleEvent(TrayAction.QUIT),
      });

      // Register items for later lookup
      this.itemRegistry.set('show', showItem);
      this.itemRegistry.set('start_recording', startRecordingItem);
      this.itemRegistry.set('stop_recording', stopRecordingItem);
      this.itemRegistry.set('quit', quitItem);

      // Build menu
      this.menuHandle = await Menu.new({
        items: [aboutItem, sep0, showItem, sep1, startRecordingItem, stopRecordingItem, sep2, quitItem],
      });

      // --- Icons ---
      // Template icon (idle) — macOS auto-tints via alpha channel
      try {
        const templatePath = await resolveResource('icons/iconTemplate@2x.png');
        this.templateIcon = await Image.fromPath(templatePath);
      } catch (iconError) {
        console.warn('Failed to load tray template icon:', iconError);
      }

      // Recording icon — same waveform in red, rendered as non-template
      // so macOS shows the actual red color instead of system tinting
      try {
        const recordingPath = await resolveResource('icons/iconRecordingTemplate@2x.png');
        this.recordingIcon = await Image.fromPath(recordingPath);
      } catch (iconError) {
        console.warn('Failed to load tray recording icon:', iconError);
      }

      // --- Tray icon ---
      this.trayHandle = await TrayIcon.new({
        id: 'kasset-main-tray',
        tooltip: APP_CONFIG.tray.tooltip,
        menu: this.menuHandle,
        icon: this.templateIcon,
        iconAsTemplate: true,
      });

      this.initialized = true;
      console.log('System tray initialized');
    } catch (error) {
      console.error('Failed to initialize system tray:', error);
    }
  }

  // ── Recording appearance ──────────────────────────────────────

  /**
   * Swap to red waveform icon and start updating Stop Recording menu item
   * with elapsed time.
   */
  async startRecordingAppearance(): Promise<void> {
    if (!this.initialized || !this.trayHandle) return;

    this.recordingStartWallTime = Date.now();
    this.pausedAccumulator = 0;
    this.pauseStartTime = 0;

    // Swap icon — non-template so the red color shows
    try {
      if (this.recordingIcon) {
        await this.trayHandle.setIcon(this.recordingIcon);
        await this.trayHandle.setIconAsTemplate(false);
      }
    } catch (error) {
      console.error('Failed to set recording icon:', error);
    }

    // Update menu items
    await this.updateMenuItem('start_recording', { enabled: false });
    await this.updateMenuItem('stop_recording', { enabled: true, text: 'Stop Recording  0:00' });

    // Start 1s interval to tick the menu item text
    this.clearMenuTimerInterval();
    this.menuTimerInterval = setInterval(() => this.tickMenuTimer(), 1000);
  }

  /**
   * Revert to idle — template icon, reset menu items.
   */
  async stopRecordingAppearance(): Promise<void> {
    if (!this.initialized || !this.trayHandle) return;

    this.clearMenuTimerInterval();
    this.recordingStartWallTime = 0;
    this.pausedAccumulator = 0;
    this.pauseStartTime = 0;

    // Restore template icon
    try {
      if (this.templateIcon) {
        await this.trayHandle.setIcon(this.templateIcon);
        await this.trayHandle.setIconAsTemplate(true);
      }
    } catch (error) {
      console.error('Failed to restore template icon:', error);
    }

    // Reset menu items
    await this.updateMenuItem('start_recording', { enabled: true });
    await this.updateMenuItem('stop_recording', { enabled: false, text: 'Stop Recording' });
  }

  /**
   * Freeze timer with pause indicator. Red icon stays.
   */
  async pauseRecordingAppearance(): Promise<void> {
    if (!this.initialized || !this.trayHandle) return;

    this.clearMenuTimerInterval();
    this.pauseStartTime = Date.now();

    const elapsed = this.computeElapsedSeconds();
    await this.updateMenuItem('stop_recording', {
      text: `Stop Recording  ${this.formatTime(elapsed)} (paused)`,
    });
  }

  /**
   * Accumulate pause duration and restart timer tick.
   */
  async resumeRecordingAppearance(): Promise<void> {
    if (!this.initialized || !this.trayHandle) return;

    if (this.pauseStartTime > 0) {
      this.pausedAccumulator += Date.now() - this.pauseStartTime;
      this.pauseStartTime = 0;
    }

    // Immediately update and restart interval
    this.tickMenuTimer();
    this.clearMenuTimerInterval();
    this.menuTimerInterval = setInterval(() => this.tickMenuTimer(), 1000);
  }

  // ── Private helpers ───────────────────────────────────────────

  private computeElapsedSeconds(): number {
    if (this.recordingStartWallTime === 0) return 0;
    const totalMs = Date.now() - this.recordingStartWallTime - this.pausedAccumulator;
    return Math.max(0, Math.floor(totalMs / 1000));
  }

  private formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private tickMenuTimer(): void {
    const elapsed = this.computeElapsedSeconds();
    this.updateMenuItem('stop_recording', {
      text: `Stop Recording  ${this.formatTime(elapsed)}`,
    }).catch((error) => {
      console.error('Failed to tick menu timer:', error);
    });
  }

  private clearMenuTimerInterval(): void {
    if (this.menuTimerInterval !== null) {
      clearInterval(this.menuTimerInterval);
      this.menuTimerInterval = null;
    }
  }

  // ── Existing public methods ───────────────────────────────────

  /**
   * Update a menu item by ID from the registry
   */
  async updateMenuItem(id: string, updates: { enabled?: boolean; text?: string }): Promise<void> {
    if (!this.initialized) return;

    const item = this.itemRegistry.get(id);
    if (!item) return;

    try {
      if (updates.enabled !== undefined) {
        await item.setEnabled(updates.enabled);
      }
      if (updates.text !== undefined) {
        await item.setText(updates.text);
      }
    } catch (error) {
      console.error(`Failed to update menu item "${id}":`, error);
    }
  }

  /**
   * Set recording state in tray menu (legacy — kept for backward compat)
   */
  async setRecordingState(isRecording: boolean): Promise<void> {
    await this.updateMenuItem('start_recording', { enabled: !isRecording });
    await this.updateMenuItem('stop_recording', { enabled: isRecording });
  }

  /**
   * Update tray tooltip
   */
  async setTooltip(tooltip: string): Promise<void> {
    if (!this.initialized || !this.trayHandle) return;

    try {
      await this.trayHandle.setTooltip(tooltip);
    } catch (error) {
      console.error('Failed to update tray tooltip:', error);
    }
  }

  private handleEvent(action: TrayAction): void {
    if (this.eventCallback) {
      this.eventCallback(action);
    }
  }
}

export const trayService = new TrayService();
