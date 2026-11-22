import { create } from 'zustand';
import { AppStatus } from '@shared/types';

export type ViewType = 'home' | 'settings' | 'reminders' | 'calendar' | 'gallery' | 'dictations';
export type SettingsPanel = 'general' | 'storage' | 'defaultModels' | 'personalization' | 'providers' | 'integrations' | 'notifications' | 'mcp' | 'usage' | 'shortcuts' | 'about';
/** `notes`: a phone's own tab for the meeting's notes (the Mac shows them beside the transcript). */
export type ResultTab = 'transcript' | 'notes' | 'summary' | 'todo' | 'related';

/** What the user asked for while a recording was capturing. */
export type ExitPromptKind = 'quit' | 'close';

interface AppStoreState {
  currentView: ViewType;
  /** Where "Back to app" (and Esc) returns from settings. */
  viewBeforeSettings: Exclude<ViewType, 'settings'>;
  status: AppStatus;
  selectedHistoryId: string | null;
  activeResultTab: ResultTab;
  activeSettingsPanel: SettingsPanel;
  /** The panel Settings was opened at (Set up AI → Providers); null when opened plainly. A phone opens it on arrival. */
  settingsRequest: SettingsPanel | null;
  /** A page inside that panel to open on arrival (Manage models → Providers › On this device); null for the panel's top. */
  settingsPage: string | null;
  /** Counts every way into a panel (sidebar, ⌘K, openSettings), so the panel starts again at its top each time, even when it
   *  is the one already open (System Settings). */
  settingsVisit: number;
  meetingChatOpen: boolean;
  permissionChecklistOpen: boolean;
  /** Quit or window close asked while recording: which one, or none. */
  recordingExitPrompt: ExitPromptKind | null;
  isInitialized: boolean;
  error: string | null;

  /** Switch between app views; Settings opens only through `openSettings`. */
  setCurrentView: (v: Exclude<ViewType, 'settings'>) => void;
  /** The one way into Settings, optionally at a panel and a page inside it. */
  openSettings: (panel?: SettingsPanel, page?: string) => void;
  /** Return from settings to the view it was opened from; no-op elsewhere. */
  leaveSettings: () => void;
  setStatus: (s: AppStatus) => void;
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
  selectedHistoryId: null,
  activeResultTab: 'summary',
  activeSettingsPanel: 'providers',
  settingsPage: null,
  settingsVisit: 0,
  settingsRequest: null,
  meetingChatOpen: false,
  permissionChecklistOpen: false,
  recordingExitPrompt: null,
  isInitialized: false,
  error: null,

  setCurrentView: (v) => set({ currentView: v }),

  openSettings: (panel, page) =>
    set((s) => ({
      currentView: 'settings',
      ...(s.currentView !== 'settings' && { viewBeforeSettings: s.currentView }),
      ...(panel && { activeSettingsPanel: panel }),
      settingsRequest: panel ?? null,
      settingsPage: page ?? null,
      settingsVisit: s.settingsVisit + 1,
    })),

  leaveSettings: () =>
    set((s) => (s.currentView === 'settings' ? { currentView: s.viewBeforeSettings, settingsRequest: null } : {})),

  setStatus: (s) =>
    set({
      status: s,
      ...(s !== AppStatus.RESULTS && { meetingChatOpen: false }),
    }),


  setSelectedHistoryId: (id) =>
    set({
      selectedHistoryId: id,
      ...(id === null && { meetingChatOpen: false }),
    }),

  setActiveResultTab: (t) => set({ activeResultTab: t }),

  setActiveSettingsPanel: (p) => set((s) => ({ activeSettingsPanel: p, settingsPage: null, settingsVisit: s.settingsVisit + 1 })),

  setMeetingChatOpen: (open) => set({ meetingChatOpen: open }),

  setPermissionChecklistOpen: (open) => set({ permissionChecklistOpen: open }),

  setRecordingExitPrompt: (prompt) => set({ recordingExitPrompt: prompt }),

  setInitialized: (v) => set({ isInitialized: v }),

  setError: (e) => set({ error: e }),

  clearError: () => set({ error: null }),

  resetToIdle: () =>
    set({
      status: AppStatus.IDLE,
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
export const useSettingsPage = () => useAppStore((s) => s.settingsPage);
export const useSettingsVisit = () => useAppStore((s) => s.settingsVisit);
export const useMeetingChatOpen = () => useAppStore((s) => s.meetingChatOpen);
export const usePermissionChecklistOpen = () => useAppStore((s) => s.permissionChecklistOpen);
export const useRecordingExitPrompt = () => useAppStore((s) => s.recordingExitPrompt);
export const useAppError = () => useAppStore((s) => s.error);

// Actions — stable references, never trigger re-render
export const useAppActions = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const leaveSettings = useAppStore((s) => s.leaveSettings);
  const openSettings = useAppStore((s) => s.openSettings);
  const setStatus = useAppStore((s) => s.setStatus);
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
