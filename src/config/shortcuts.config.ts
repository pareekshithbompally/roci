/**
 * Keyboard shortcuts — the single registry. Data only; matching and labels
 * live in `@features/shortcuts`.
 *
 * Accelerators use Tauri's accelerator syntax (`CommandOrControl+Shift+K`,
 * `Option+Comma`) for both scopes, so one vocabulary describes every key.
 */

export interface ShortcutDefinition {
  accelerator: string;
  description: string;
}

/** In-window shortcuts: matched on keydown while a Kasset window has focus. */
export const APP_SHORTCUTS = {
  search: { accelerator: 'CommandOrControl+K', description: 'Search meetings and chats' },
  focusChat: { accelerator: 'CommandOrControl+L', description: 'Jump to the chat composer' },
  newChat: { accelerator: 'CommandOrControl+N', description: 'Start a new chat' },
  openSettings: { accelerator: 'CommandOrControl+Comma', description: 'Open settings' },
  leaveSettings: { accelerator: 'Escape', description: 'Back to the app from settings' },
} as const satisfies Record<string, ShortcutDefinition>;

export type AppShortcutId = keyof typeof APP_SHORTCUTS;

/**
 * System-wide shortcuts, registered with the OS (Tauri global-shortcut). The
 * key is the action Rust emits on `shortcut-triggered`.
 */
export const GLOBAL_SHORTCUTS = {
  'toggle-recording': { accelerator: 'Option+Shift+R', description: 'Start or stop recording' },
  'show-window': { accelerator: 'Option+Shift+A', description: 'Show Kasset' },
  'new-chat': { accelerator: 'Option+Shift+N', description: 'Start a new chat' },
  'open-settings': { accelerator: 'Option+Shift+Comma', description: 'Open settings' },
} as const satisfies Record<string, ShortcutDefinition>;

export type GlobalShortcutId = keyof typeof GLOBAL_SHORTCUTS;

/** Rust → webview: a global shortcut fired; payload is its `GlobalShortcutId`. */
export const GLOBAL_SHORTCUT_EVENT = 'shortcut-triggered';

/**
 * Where a shortcut with no ⌘/⌃/⌥ (Esc) is left to the focused element: text
 * fields, and dialogs, menus and lists that use Esc to close themselves.
 */
export const BARE_SHORTCUT_BLOCKERS =
  'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Modifier tokens → the KeyboardEvent flag each requires, and its macOS glyph. */
export const SHORTCUT_MODIFIERS = {
  CommandOrControl: { flag: 'metaKey', glyph: '⌘' },
  Command: { flag: 'metaKey', glyph: '⌘' },
  Control: { flag: 'ctrlKey', glyph: '⌃' },
  Option: { flag: 'altKey', glyph: '⌥' },
  Alt: { flag: 'altKey', glyph: '⌥' },
  Shift: { flag: 'shiftKey', glyph: '⇧' },
} as const satisfies Record<string, { flag: ShortcutModifierFlag; glyph: string }>;

export type ShortcutModifierFlag = 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey';

/**
 * Named key tokens → the `KeyboardEvent.key` they produce, which is also how
 * they display. Single letters and digits need no entry.
 */
export const SHORTCUT_KEYS: Record<string, string> = {
  Comma: ',',
};

/** How a key displays when it isn't its own character (by lower-cased `KeyboardEvent.key`). */
export const SHORTCUT_KEY_LABELS: Record<string, string> = {
  escape: 'esc',
};
