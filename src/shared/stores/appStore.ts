import { create } from 'zustand';
import { AppStatus, type ProcessedResult } from '@shared/types';

export type ViewType = 'home' | 'settings' | 'reminders' | 'calendar' | 'gallery';
export type SettingsPanel = 'general' | 'defaultModels' | 'providers' | 'integrations' | 'notifications' | 'mcp' | 'usage';
export type ResultTab = 'transcript' | 'summary' | 'todo' | 'notes';

/** What the user asked for while a recording was capturing. */
export type ExitPromptKind = 'quit' | 'close';

interface AppStoreState {
  currentView: ViewType;
  /** Where "Back to app" (and Esc) returns from settings. */
  viewBeforeSettings: Exclude<ViewType, 'settings'>;
  status: AppStatus;
  result: ProcessedResult | null;
  selectedHistoryId: string | null;
  activeResultTab: ResultTab;
  activeSettingsPanel: SettingsPanel;
  /** The panel Settings was opened at (Set up AI → Providers); null when opened plainly. A phone opens it on arrival. */
  settingsRequest: SettingsPanel | null;
  meetingChatOpen: boolean;
  permissionChecklistOpen: boolean;
  /** Quit or window close asked while recording: which one, or none. */
  recordingExitPrompt: ExitPromptKind | null;
  isInitialized: boolean;
  error: string | null;

  /** Switch between app views; Settings opens only through `openSettings`. */
  setCurrentView: (v: Exclude<ViewType, 'settings'>) => void;
  /** The one way into Settings, optionally at a panel. */
  openSettings: (panel?: SettingsPanel) => void;
  /** Return from settings to the view it was opened from; no-op elsewhere. */
  leaveSettings: () => void;
  setStatus: (s: AppStatus) => void;
  setResult: (r: ProcessedResult | null) => void;
  setSelectedHistoryId: (id: string | null) => void;
  setActiveResultTab: (t: ResultTab) => void;
  setActiveSettingsPanel: (p: SettingsPanel) => void;
  setMeetingChatOpen: (open: boolean) => void;
  setPermissionChecklistOpen: (open: boolean) => void;
  setRecordingExitPrompt: (prompt: ExitPromptKind | null) => void;
  setInitialized: (v: boolean) => void;
  setError: (e: string | null) => void;
  clearError: () => void;
  resetToIdle: () => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  currentView: 'home',
  viewBeforeSettings: 'home',
  status: AppStatus.IDLE,
  result: null,
  selectedHistoryId: null,
  activeResultTab: 'summary',
  activeSettingsPanel: 'general',
  settingsRequest: null,
  meetingChatOpen: false,
  permissionChecklistOpen: false,
  recordingExitPrompt: null,
  isInitialized: false,
  error: null,

  setCurrentView: (v) => set({ currentView: v }),

  openSettings: (panel) =>
    set((s) => ({
      currentView: 'settings',
      ...(s.currentView !== 'settings' && { viewBeforeSettings: s.currentView }),
      ...(panel && { activeSettingsPanel: panel }),
      settingsRequest: panel ?? null,
    })),

  leaveSettings: () =>
    set((s) => (s.currentView === 'settings' ? { currentView: s.viewBeforeSettings, settingsRequest: null } : {})),

  setStatus: (s) =>
    set({
      status: s,
      ...(s !== AppStatus.RESULTS && { meetingChatOpen: false }),
    }),

  setResult: (r) => set({ result: r }),

  setSelectedHistoryId: (id) =>
    set({
      selectedHistoryId: id,
      ...(id === null && { meetingChatOpen: false }),
    }),

  setActiveResultTab: (t) => set({ activeResultTab: t }),

  setActiveSettingsPanel: (p) => set({ activeSettingsPanel: p }),

  setMeetingChatOpen: (open) => set({ meetingChatOpen: open }),

  setPermissionChecklistOpen: (open) => set({ permissionChecklistOpen: open }),

  setRecordingExitPrompt: (prompt) => set({ recordingExitPrompt: prompt }),

  setInitialized: (v) => set({ isInitialized: v }),

  setError: (e) => set({ error: e }),

  clearError: () => set({ error: null }),

  resetToIdle: () =>
    set({
      status: AppStatus.IDLE,
      result: null,
      selectedHistoryId: null,
      meetingChatOpen: false,
    }),
}));

// State selectors (each re-renders ONLY when that slice changes)
export const useCurrentView = () => useAppStore((s) => s.currentView);
export const useAppStatus = () => useAppStore((s) => s.status);
export const useSelectedHistoryId = () => useAppStore((s) => s.selectedHistoryId);
export const useActiveResultTab = () => useAppStore((s) => s.activeResultTab);
export const useActiveSettingsPanel = () => useAppStore((s) => s.activeSettingsPanel);
export const useMeetingChatOpen = () => useAppStore((s) => s.meetingChatOpen);
export const usePermissionChecklistOpen = () => useAppStore((s) => s.permissionChecklistOpen);
export const useRecordingExitPrompt = () => useAppStore((s) => s.recordingExitPrompt);
export const useAppResult = () => useAppStore((s) => s.result);
export const useAppError = () => useAppStore((s) => s.error);

// Actions — stable references, never trigger re-render
export const useAppActions = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const leaveSettings = useAppStore((s) => s.leaveSettings);
  const openSettings = useAppStore((s) => s.openSettings);
  const setStatus = useAppStore((s) => s.setStatus);
  const setResult = useAppStore((s) => s.setResult);
  const setSelectedHistoryId = useAppStore((s) => s.setSelectedHistoryId);
  const setActiveResultTab = useAppStore((s) => s.setActiveResultTab);
  const setActiveSettingsPanel = useAppStore((s) => s.setActiveSettingsPanel);
  const setMeetingChatOpen = useAppStore((s) => s.setMeetingChatOpen);
  const setInitialized = useAppStore((s) => s.setInitialized);
  const setError = useAppStore((s) => s.setError);
  const clearError = useAppStore((s) => s.clearError);
  const resetToIdle = useAppStore((s) => s.resetToIdle);

  return {
    setCurrentView,
    openSettings,
    leaveSettings,
    setStatus,
    setResult,
    setSelectedHistoryId,
    setActiveResultTab,
    setActiveSettingsPanel,
    setMeetingChatOpen,
    setInitialized,
    setError,
    clearError,
    resetToIdle,
  };
};
