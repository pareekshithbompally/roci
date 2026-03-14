/**
 * UnsavedChangesContext
 * 
 * Manages unsaved changes state across settings panels.
 * Provides warning modal functionality when navigating away with unsaved changes.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface UnsavedChangesState {
  hasUnsavedChanges: boolean;
  panelId: string | null;
  pendingNavigation: (() => void) | null;
  showWarningModal: boolean;
}

interface UnsavedChangesContextValue {
  /** Whether the current panel has unsaved changes */
  hasUnsavedChanges: boolean;
  /** Mark the current panel as having unsaved changes */
  setHasUnsavedChanges: (hasChanges: boolean, panelId?: string) => void;
  /** Clear unsaved changes state */
  clearUnsavedChanges: () => void;
  /** Check if navigation should be blocked, returns true if blocked */
  checkNavigation: (onProceed: () => void) => boolean;
  /** Confirm navigation (discard changes) */
  confirmNavigation: () => void;
  /** Cancel navigation (stay on page) */
  cancelNavigation: () => void;
  /** Whether the warning modal should be shown */
  showWarningModal: boolean;
  /** Current panel with unsaved changes */
  currentPanelId: string | null;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export const UnsavedChangesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<UnsavedChangesState>({
    hasUnsavedChanges: false,
    panelId: null,
    pendingNavigation: null,
    showWarningModal: false,
  });

  const setHasUnsavedChanges = useCallback((hasChanges: boolean, panelId?: string) => {
    setState(prev => ({
      ...prev,
      hasUnsavedChanges: hasChanges,
      panelId: hasChanges ? (panelId || prev.panelId) : null,
    }));
  }, []);

  const clearUnsavedChanges = useCallback(() => {
    setState(prev => ({
      ...prev,
      hasUnsavedChanges: false,
      panelId: null,
    }));
  }, []);

  const checkNavigation = useCallback((onProceed: () => void): boolean => {
    if (state.hasUnsavedChanges) {
      setState(prev => ({
        ...prev,
        pendingNavigation: onProceed,
        showWarningModal: true,
      }));
      return true; // Navigation blocked
    }
    return false; // Navigation allowed
  }, [state.hasUnsavedChanges]);

  const confirmNavigation = useCallback(() => {
    const { pendingNavigation } = state;
    setState({
      hasUnsavedChanges: false,
      panelId: null,
      pendingNavigation: null,
      showWarningModal: false,
    });
    // Execute the pending navigation after state is cleared
    if (pendingNavigation) {
      pendingNavigation();
    }
  }, [state]);

  const cancelNavigation = useCallback(() => {
    setState(prev => ({
      ...prev,
      pendingNavigation: null,
      showWarningModal: false,
    }));
  }, []);

  return (
    <UnsavedChangesContext.Provider
      value={{
        hasUnsavedChanges: state.hasUnsavedChanges,
        setHasUnsavedChanges,
        clearUnsavedChanges,
        checkNavigation,
        confirmNavigation,
        cancelNavigation,
        showWarningModal: state.showWarningModal,
        currentPanelId: state.panelId,
      }}
    >
      {children}
    </UnsavedChangesContext.Provider>
  );
};

export const useUnsavedChanges = (): UnsavedChangesContextValue => {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return context;
};

export default UnsavedChangesContext;
