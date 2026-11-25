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
export { useSettings, useAppUpdate, useUpdateRuntime, useMenubarSpeechModels, useMenubarReports, useStorageRetention, useLocalModelDownloads, useLocalModelResume, useLocalModelIdle, useOnDeviceServerConfig, useLiveDictation, useSelectedSpeechOption, freshSpeechSources } from './hooks';
export type { LiveDictation, AIReadiness } from './hooks';
export { aiSetupStep, useAIReadiness, useOpenAISetup } from './hooks';

export { preloadSystemInfo, useSystemInfo } from './hooks/useSystemInfo';

// Re-export context for provider usage
export { SettingsProvider } from '@shared/contexts/SettingsContext';
export { SETTINGS_SECTIONS } from './components/SettingsNav';
export { useProviderDefaults } from './hooks';
export type { DetectedProvider, ProviderDefaultsSetup } from './hooks';
// Job rows, shared with onboarding's list of defaults
export { CapabilityRow } from './components/shared';
export { DefaultsList } from './components/DefaultsList';
export { useChatModelDownload } from './hooks/useLocalModels';
