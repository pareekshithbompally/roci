// Components
export { 
  SettingsPanel, 
  ProvidersPanel, 
  GeneralPanel,
  CapabilitiesPanel,
} from './components';

// Hooks
export { useSettings, useAppUpdate, scheduleStartupCheck, useMenubarSpeechModels, useLocalModelDownloads, useLocalModelControls, useLiveDictation, freshSpeechSources } from './hooks';
export type { LiveDictation } from './hooks';

// Stores
export { systemInfoStore, useSystemInfo } from './stores';
export type { IndexStats, DiskUsageEntry } from './stores';

// Re-export context for provider usage
export { SettingsProvider, useSettings as useSettingsContext } from '@shared/contexts/SettingsContext';
