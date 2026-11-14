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
  GeneralPanel,
  CapabilitiesPanel,
  UpdateBanner,
} from './components';

// Hooks
export { useSettings, useAppUpdate, scheduleStartupCheck, useMenubarSpeechModels } from './hooks';

// Stores
export { systemInfoStore, useSystemInfo } from './stores';
export type { IndexStats, DiskUsageEntry } from './stores';

// Re-export context for provider usage
export { SettingsProvider, useSettings as useSettingsContext } from '@shared/contexts/SettingsContext';
