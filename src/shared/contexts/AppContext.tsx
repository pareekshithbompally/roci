/**
 * App Context
 * 
 * Global application state and status management.
 * Provides app-wide state like view management, result display, etc.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AppStatus as AppStatusEnum, ProcessedResult } from '@/types';

// Re-export AppStatus enum for convenience
export { AppStatus } from '@/types';

type ViewType = 'home' | 'settings' | 'reminders' | 'calendar';
type SettingsPanel = 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface';
type ResultTab = 'transcript' | 'summary' | 'todo' | 'notes';

interface AppState {
  /** Current view (home or settings) */
  currentView: ViewType;
  /** App status (idle, setup, recording, review, processing, results) */
  status: AppStatusEnum;
  /** Current result being displayed */
  result: ProcessedResult | null;
  /** Selected history item ID */
  selectedHistoryId: string | null;
  /** Active result tab */
  activeResultTab: ResultTab;
  /** Active settings panel */
  activeSettingsPanel: SettingsPanel;
  /** Is meeting chat panel open */
  meetingChatOpen: boolean;
  /** Is app initialized */
  isInitialized: boolean;
  /** Global error */
  error: string | null;
}

interface AppContextValue extends AppState {
  /** Set current view */
  setCurrentView: (view: ViewType) => void;
  /** Set app status */
  setStatus: (status: AppStatusEnum) => void;
  /** Set current result */
  setResult: (result: ProcessedResult | null) => void;
  /** Set selected history ID */
  setSelectedHistoryId: (id: string | null) => void;
  /** Set active result tab */
  setActiveResultTab: (tab: ResultTab) => void;
  /** Set active settings panel */
  setActiveSettingsPanel: (panel: SettingsPanel) => void;
  /** Set meeting chat panel open state */
  setMeetingChatOpen: (open: boolean) => void;
  /** Set app as initialized */
  setInitialized: (value: boolean) => void;
  /** Set global error */
  setError: (error: string | null) => void;
  /** Clear error */
  clearError: () => void;
  /** Reset to idle state */
  resetToIdle: () => void;
}

const initialState: AppState = {
  currentView: 'home',
  status: AppStatusEnum.IDLE,
  result: null,
  selectedHistoryId: null,
  activeResultTab: 'summary',
  activeSettingsPanel: 'audio',
  meetingChatOpen: false,
  isInitialized: false,
  error: null,
};

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

/**
 * AppProvider
 * 
 * Provides global app state management.
 * 
 * @example
 * ```tsx
 * <AppProvider>
 *   <App />
 * </AppProvider>
 * ```
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, setState] = useState<AppState>(initialState);

  const setCurrentView = useCallback((view: ViewType) => {
    setState((prev) => ({ ...prev, currentView: view }));
  }, []);

  const setStatus = useCallback((status: AppStatusEnum) => {
    setState((prev) => ({
      ...prev,
      status,
      // Auto-close meeting chat when leaving RESULTS
      ...(status !== AppStatusEnum.RESULTS && { meetingChatOpen: false }),
    }));
  }, []);

  const setResult = useCallback((result: ProcessedResult | null) => {
    setState((prev) => ({ ...prev, result }));
  }, []);

  const setSelectedHistoryId = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedHistoryId: id,
      // Auto-close meeting chat when clearing selection
      ...(id === null && { meetingChatOpen: false }),
    }));
  }, []);

  const setActiveResultTab = useCallback((tab: ResultTab) => {
    setState((prev) => ({ ...prev, activeResultTab: tab }));
  }, []);

  const setActiveSettingsPanel = useCallback((panel: SettingsPanel) => {
    setState((prev) => ({ ...prev, activeSettingsPanel: panel }));
  }, []);

  const setMeetingChatOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, meetingChatOpen: open }));
  }, []);

  const setInitialized = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, isInitialized: value }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const resetToIdle = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: AppStatusEnum.IDLE,
      result: null,
      selectedHistoryId: null,
      meetingChatOpen: false,
    }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...state,
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

/**
 * useApp Hook
 * 
 * Access global app state and controls.
 * 
 * @example
 * ```tsx
 * const { status, setStatus, currentView, setCurrentView } = useApp();
 * ```
 */
export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

// Alias for backwards compatibility
export const useAppContext = useApp;

export default AppContext;
