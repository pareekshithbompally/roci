/**
 * Keyboard Shortcuts Service
 * 
 * Manages global keyboard shortcuts using Tauri's global shortcut plugin.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DEFAULT_SHORTCUTS, ShortcutsConfig } from '@config/shortcuts.config';

export type ShortcutHandler = (action: string) => void | Promise<void>;

class ShortcutsService {
  private handlers: Map<string, ShortcutHandler[]> = new Map();
  private initialized = false;

  /**
   * Initialize the shortcuts service
   * Registers all default shortcuts and sets up event listeners
   */
  async initialize(customShortcuts?: ShortcutsConfig): Promise<void> {
    if (this.initialized) {
      console.warn('Shortcuts service already initialized');
      return;
    }

    try {
      const shortcuts = customShortcuts || DEFAULT_SHORTCUTS;

      // Listen for shortcut trigger events from Rust
      await listen<string>('shortcut-triggered', (event) => {
        const action = event.payload;
        this.triggerAction(action);
      });

      // Register all enabled shortcuts
      const enabledShortcuts = Object.values(shortcuts).filter(s => s.enabled);
      
      for (const shortcut of enabledShortcuts) {
        try {
          await this.registerShortcut(shortcut.key, shortcut.action);
          console.log(`Registered shortcut: ${shortcut.key} -> ${shortcut.action}`);
        } catch (error) {
          console.warn(`[ShortcutsService] Could not register ${shortcut.key} (may conflict with system shortcut)`);
        }
      }

      this.initialized = true;
      console.log('Shortcuts service initialized');
    } catch (error) {
      console.error('Failed to initialize shortcuts service:', error);
      throw error;
    }
  }

  /**
   * Register a single keyboard shortcut
   */
  async registerShortcut(key: string, action: string): Promise<void> {
    try {
      await invoke('register_shortcut', { shortcut: key, action });
    } catch (error) {
      throw new Error(`Failed to register shortcut ${key}: ${error}`);
    }
  }

  /**
   * Unregister a single keyboard shortcut
   */
  async unregisterShortcut(key: string): Promise<void> {
    try {
      await invoke('unregister_shortcut', { shortcut: key });
    } catch (error) {
      throw new Error(`Failed to unregister shortcut ${key}: ${error}`);
    }
  }

  /**
   * Unregister all keyboard shortcuts
   */
  async unregisterAll(): Promise<void> {
    try {
      await invoke('unregister_all_shortcuts');
      this.handlers.clear();
      this.initialized = false;
    } catch (error) {
      throw new Error(`Failed to unregister all shortcuts: ${error}`);
    }
  }

  /**
   * Check if a shortcut is currently registered
   */
  async isRegistered(key: string): Promise<boolean> {
    try {
      return await invoke<boolean>('is_shortcut_registered', { shortcut: key });
    } catch (error) {
      console.error(`Failed to check if shortcut is registered: ${error}`);
      return false;
    }
  }

  /**
   * Register a handler for a specific action
   */
  on(action: string, handler: ShortcutHandler): () => void {
    if (!this.handlers.has(action)) {
      this.handlers.set(action, []);
    }
    
    this.handlers.get(action)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(action);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Trigger all handlers for a specific action
   */
  private async triggerAction(action: string): Promise<void> {
    const handlers = this.handlers.get(action);
    if (!handlers || handlers.length === 0) {
      console.warn(`No handlers registered for action: ${action}`);
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(action);
      } catch (error) {
        console.error(`Error in shortcut handler for ${action}:`, error);
      }
    }
  }

  /**
   * Update shortcuts (unregister old, register new)
   */
  async updateShortcuts(newShortcuts: ShortcutsConfig): Promise<void> {
    try {
      // Unregister all current shortcuts
      await this.unregisterAll();

      // Register new shortcuts
      await this.initialize(newShortcuts);
    } catch (error) {
      console.error('Failed to update shortcuts:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const shortcutsService = new ShortcutsService();
