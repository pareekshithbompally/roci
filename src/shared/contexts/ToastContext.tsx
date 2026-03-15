/**
 * Toast Context
 *
 * Centralized toast API over Sonner. All components should use
 * useToast().showToast() instead of importing sonner directly.
 *
 * Provides consistent icons (white Lucide, 16px) and richColors
 * styling for every toast type. Sonner's <Toaster> is rendered in App.tsx.
 *
 * Tier 1: Simple confirmations — 5s default (set on <Toaster>)
 * Tier 3: Errors with recovery action — 8s duration, action button
 */

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
  showErrorWithRetry: (message: string, retryFn: () => void) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

/** Tier 3 toasts (with action) get a longer duration so users can interact */
const TIER3_DURATION = 8000;

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const showToast = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const opts: Record<string, unknown> = {};
    if (action) {
      opts.action = { label: action.label, onClick: action.onClick };
      opts.duration = TIER3_DURATION;
    }

    switch (type) {
      case 'success':
        sonnerToast.success(message, opts);
        break;
      case 'error':
        sonnerToast.error(message, opts);
        break;
      case 'warning':
        sonnerToast.warning(message, opts);
        break;
      case 'info':
      default:
        sonnerToast.info(message, opts);
        break;
    }
  }, []);

  const showErrorWithRetry = useCallback((message: string, retryFn: () => void) => {
    sonnerToast.error(message, {
      duration: TIER3_DURATION,
      action: { label: 'Retry', onClick: retryFn },
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    sonnerToast.dismiss(id);
  }, []);

  const clearToasts = useCallback(() => {
    sonnerToast.dismiss();
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showErrorWithRetry, dismissToast, clearToasts }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;
