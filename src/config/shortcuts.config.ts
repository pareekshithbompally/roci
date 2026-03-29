/**
 * Keyboard Shortcuts Configuration
 * 
 * Defines all global keyboard shortcuts for the application.
 * Uses platform-agnostic key names (CommandOrControl automatically maps to Cmd on macOS, Ctrl elsewhere).
 */

export interface ShortcutDefinition {
  key: string;
  description: string;
  action: string;
  enabled: boolean;
}

export interface ShortcutsConfig {
  [key: string]: ShortcutDefinition;
}

/**
 * Default keyboard shortcuts
 * Note: CommandOrControl = Cmd on macOS, Ctrl on Windows/Linux
 */
export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  TOGGLE_RECORDING: {
    key: 'CommandOrControl+Shift+R',
    description: 'Start or stop audio recording',
    action: 'toggle-recording',
    enabled: true
  },
  SHOW_WINDOW: {
    key: 'CommandOrControl+Shift+A',
    description: 'Show and focus application window',
    action: 'show-window',
    enabled: true
  },
  NEW_CHAT: {
    key: 'CommandOrControl+Shift+N',
    description: 'Start a new AI chat',
    action: 'new-chat',
    enabled: true
  },
  OPEN_SETTINGS: {
    key: 'CommandOrControl+Shift+Comma',
    description: 'Open application settings',
    action: 'open-settings',
    enabled: true
  }
};

/**
 * Shortcut action types
 */
export enum ShortcutAction {
  TOGGLE_RECORDING = 'toggle-recording',
  SHOW_WINDOW = 'show-window',
  NEW_CHAT = 'new-chat',
  OPEN_SETTINGS = 'open-settings'
}

/**
 * Platform detection
 */
export const PLATFORM = {
  isMac: () => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'),
  isWindows: () => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('win'),
  isLinux: () => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('linux')
};

/**
 * Convert accelerator to human-readable format
 * Example: "CommandOrControl+Shift+R" → "⌘⇧R" (macOS) or "Ctrl+Shift+R" (others)
 */
export function formatShortcut(accelerator: string): string {
  const isMac = PLATFORM.isMac();
  
  let formatted = accelerator
    .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Command/g, isMac ? '⌘' : 'Cmd')
    .replace(/Control/g, isMac ? '⌃' : 'Ctrl')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Option/g, '⌥')
    .replace(/Comma/g, ',');
  
  // Remove + on macOS for cleaner look
  if (isMac) {
    formatted = formatted.replace(/\+/g, '');
  }
  
  return formatted;
}

/**
 * Validate shortcut format
 */
export function validateShortcut(accelerator: string): boolean {
  // Basic validation: must have at least one modifier and a key
  const validModifiers = ['CommandOrControl', 'Command', 'Control', 'Shift', 'Alt', 'Option'];
  const parts = accelerator.split('+');
  
  if (parts.length < 2) return false;
  
  const hasModifier = parts.some(part => validModifiers.includes(part));
  const hasKey = parts.length > 0 && parts[parts.length - 1].length > 0;
  
  return hasModifier && hasKey;
}

/**
 * Get shortcut by action
 */
export function getShortcutByAction(action: string, shortcuts: ShortcutsConfig = DEFAULT_SHORTCUTS): ShortcutDefinition | null {
  const entry = Object.entries(shortcuts).find(([_, def]) => def.action === action);
  return entry ? entry[1] : null;
}

/**
 * Get all enabled shortcuts
 */
export function getEnabledShortcuts(shortcuts: ShortcutsConfig = DEFAULT_SHORTCUTS): ShortcutsConfig {
  return Object.fromEntries(
    Object.entries(shortcuts).filter(([_, def]) => def.enabled)
  );
}

/**
 * Check for conflicting shortcuts
 */
export function findConflicts(shortcuts: ShortcutsConfig): string[] {
  const keys = Object.values(shortcuts)
    .filter(def => def.enabled)
    .map(def => def.key);
  
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  return [...new Set(duplicates)]; // Remove duplicates from duplicates list
}
