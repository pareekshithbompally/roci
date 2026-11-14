/**
 * Shortcuts Feature Module — recognises in-window keyboard shortcuts from the
 * `@config/shortcuts.config` registry and renders their labels.
 */

export { useAppShortcuts } from './hooks/useAppShortcuts';
export type { AppShortcutHandlers } from './hooks/useAppShortcuts';
export { findAppShortcut, formatAccelerator, shortcutLabel } from './accelerator';
