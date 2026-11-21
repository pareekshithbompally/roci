/** Keyboard shortcut registry (data only), in Tauri accelerator syntax for both scopes. */

import { AppWindow, ArrowLeft, Mic, Search, Settings, SquarePen, TextCursorInput, type LucideIcon } from 'lucide-react';

export interface ShortcutDefinition {
  accelerator: string;
  description: string;
  /** Its glyph in Settings › Shortcuts. */
  icon: LucideIcon;
}

/** In-window shortcuts: matched on keydown while a Roci window has focus. */
export const APP_SHORTCUTS = {
  search: { accelerator: 'CommandOrControl+K', description: 'Search meetings and chats', icon: Search },
  focusChat: { accelerator: 'CommandOrControl+L', description: 'Jump to the chat composer', icon: TextCursorInput },
  newChat: { accelerator: 'CommandOrControl+N', description: 'Start a new chat', icon: SquarePen },
  openSettings: { accelerator: 'CommandOrControl+Comma', description: 'Open settings', icon: Settings },
  leaveSettings: { accelerator: 'Escape', description: 'Back to the app from settings', icon: ArrowLeft },
} as const satisfies Record<string, ShortcutDefinition>;

export type AppShortcutId = keyof typeof APP_SHORTCUTS;

/** System-wide shortcuts registered with the OS; the key is the action Rust emits on `shortcut-triggered`. */
export const GLOBAL_SHORTCUTS = {
  'toggle-recording': { accelerator: 'Option+Shift+R', description: 'Start or stop recording', icon: Mic },
  'show-window': { accelerator: 'Option+Shift+A', description: 'Show Roci', icon: AppWindow },
  'new-chat': { accelerator: 'Option+Shift+N', description: 'Start a new chat', icon: SquarePen },
  'open-settings': { accelerator: 'Option+Shift+Comma', description: 'Open settings', icon: Settings },
} as const satisfies Record<string, ShortcutDefinition>;

export type GlobalShortcutId = keyof typeof GLOBAL_SHORTCUTS;

/** Rust → webview: a global shortcut fired; payload is its `GlobalShortcutId`. */
export const GLOBAL_SHORTCUT_EVENT = 'shortcut-triggered';

/** Where a bare shortcut (Esc) is left to the focused element: text fields, dialogs, menus and lists. */
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

/** Named key tokens → the `KeyboardEvent.key` they produce and display as; letters and digits need no entry. */
export const SHORTCUT_KEYS: Record<string, string> = {
  Comma: ',',
};

/** How a key displays when it isn't its own character (by lower-cased `KeyboardEvent.key`). */
export const SHORTCUT_KEY_LABELS: Record<string, string> = {
  escape: 'esc',
};
