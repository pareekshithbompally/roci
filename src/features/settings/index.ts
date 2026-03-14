/**
 * Settings Feature Module
 * 
 * Complete settings management functionality.
 */

// Components
export { 
  SettingsPanel, 
  ProvidersPanel, 
  CategoriesPanel, 
  InterfacePanel 
} from './components';

// Hooks
export { useSettings } from './hooks';

// Re-export context for provider usage
export { SettingsProvider, useSettings as useSettingsContext } from '@shared/contexts/SettingsContext';
