// Components
export { 
  SettingsPanel,
  SettingsHome,
  settingsScreen, 
  ProvidersPanel, 
  ProviderConnection,
  ProviderStatus,
  cloudRowState,
  GeneralPanel,
  DefaultModelsPanel,
} from './components';

// Hooks
export { useLocalServers } from './hooks/useLocalServers';
export { useProviderConnection } from './hooks/useProviderConnection';
export { useSettings, useAppUpdate, scheduleStartupCheck, useMenubarSpeechModels, useMenubarReports, useLocalModelDownloads, useLiveDictation, freshSpeechSources } from './hooks';
export type { LiveDictation, AIReadiness } from './hooks';
export { useAIReadiness, useOpenAISetup } from './hooks';

// Stores
export { systemInfoStore, useSystemInfo } from './stores';
export type { IndexStats, DiskUsageEntry } from './stores';

// Re-export context for provider usage
export { SettingsProvider, useSettings as useSettingsContext } from '@shared/contexts/SettingsContext';
