/**
 * Auto-Launch Service
 * 
 * Manages application auto-launch on system startup.
 */

import { invoke } from '@tauri-apps/api/core';

class AutostartService {
  /**
   * Enable auto-launch on system startup
   */
  async enable(): Promise<void> {
    try {
      await invoke('enable_autostart');
      console.log('Auto-launch enabled');
    } catch (error) {
      console.error('Failed to enable auto-launch:', error);
      throw error;
    }
  }

  /**
   * Disable auto-launch on system startup
   */
  async disable(): Promise<void> {
    try {
      await invoke('disable_autostart');
      console.log('Auto-launch disabled');
    } catch (error) {
      console.error('Failed to disable auto-launch:', error);
      throw error;
    }
  }

  /**
   * Check if auto-launch is enabled
   */
  async isEnabled(): Promise<boolean> {
    try {
      return await invoke<boolean>('is_autostart_enabled');
    } catch (error) {
      console.error('Failed to check auto-launch status:', error);
      return false;
    }
  }

  /**
   * Toggle auto-launch
   */
  async toggle(): Promise<boolean> {
    const isEnabled = await this.isEnabled();
    
    if (isEnabled) {
      await this.disable();
      return false;
    } else {
      await this.enable();
      return true;
    }
  }
}

// Export singleton instance
export const autostartService = new AutostartService();
