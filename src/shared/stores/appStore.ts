import { create } from 'zustand';
import { AppStatus, type ProcessedResult } from '@shared/types';

export type ViewType = 'home' | 'settings' | 'reminders' | 'calendar';
export type SettingsPanel = 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface';
export type ResultTab = 'transcript' | 'summary' | 'todo' | 'notes';

interface AppStoreState {
  currentView: ViewType;
  status: AppStatus;
  result: ProcessedResult | null;
  selectedHistoryId: string | null;
  activeResultTab: ResultTab;
  activeSettingsPanel: SettingsPanel;
  meetingChatOpen: boolean;
  isInitialized: boolean;
  error: string | null;

  setCurrentView: (v: ViewType) => void;
  setStatus: (s: AppStatus) => void;
  setResult: (r: ProcessedResult | null) => void;
  setSelectedHistoryId: (id: string | null) => void;
  setActiveResultTab: (t: ResultTab) => void;
  setActiveSettingsPanel: (p: SettingsPanel) => void;
  setMeetingChatOpen: (open: boolean) => void;
  setInitialized: (v: boolean) => void;
  setError: (e: string | null) => void;
  clearError: () => void;
  resetToIdle: () => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  currentView: 'home',
  status: AppStatus.IDLE,
  result: null,
  selectedHistoryId: null,
  activeResultTab: 'summary',
  activeSettingsPanel: 'audio',
  meetingChatOpen: false,
  isInitialized: false,
  error: null,

  setCurrentView: (v) => set({ currentView: v }),

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
export const useAppResult = () => useAppStore((s) => s.result);
export const useAppError = () => useAppStore((s) => s.error);

// Actions — stable references, never trigger re-render
export const useAppActions = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
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
