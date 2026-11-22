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
export { useSettings, useAppUpdate, useUpdateRuntime, useMenubarSpeechModels, useMenubarReports, useStorageRetention, useLocalModelDownloads, useLocalModelIdle, useLiveDictation, useSelectedSpeechOption, freshSpeechSources } from './hooks';
export type { LiveDictation, AIReadiness } from './hooks';
export { aiSetupStep, useAIReadiness, useOpenAISetup } from './hooks';

export { preloadSystemInfo, useSystemInfo } from './hooks/useSystemInfo';

// Re-export context for provider usage
export { SettingsProvider, useSettings as useSettingsContext } from '@shared/contexts/SettingsContext';
export { SETTINGS_SECTIONS } from './components/SettingsNav';
// Job rows and on-device downloads, shared with onboarding's on-device setup
export { CapabilityRow, ModelSelect } from './components/shared';
export { useChatModelDownload, useLocalModelControls } from './hooks/useLocalModels';
