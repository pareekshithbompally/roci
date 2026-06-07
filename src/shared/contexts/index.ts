/**
 * Shared Contexts Module
 * 
 * Global contexts for app-wide state.
 */

// Toast Context
export { ToastProvider, useToast } from './ToastContext';
export type { ToastType } from './ToastContext';

// Theme Context
export { ThemeProvider, useThemeContext } from './ThemeContext';
export type { Theme } from './ThemeContext';

// History Context
export { HistoryProvider, useHistory } from './HistoryContext';

// Chat Context
export { ChatProvider, useChat } from './ChatContext';

// Settings Context
export { SettingsProvider, useSettings } from './SettingsContext';

// Unsaved Changes Context
export { UnsavedChangesProvider, useUnsavedChanges } from './UnsavedChangesContext';
