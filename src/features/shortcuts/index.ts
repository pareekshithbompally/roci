/** Recognises in-window shortcuts from the `@config/shortcuts.config` registry and renders their labels. */

export { useAppShortcuts } from './hooks/useAppShortcuts';
export type { AppShortcutHandlers } from './hooks/useAppShortcuts';
export { acceleratorKeys, findAppShortcut, shortcutKeys, shortcutLabel } from './accelerator';
