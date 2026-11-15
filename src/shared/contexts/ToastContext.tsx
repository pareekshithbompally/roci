/** React handle on in-app toasts; only for what you can't see where you are (errors, work finished elsewhere). */

import React, { createContext, useContext, type ReactNode } from 'react';
import { dismissToast, showToast } from '@shared/ui';
import type { ToastAction, ToastTone } from '@shared/ui';

export type ToastType = ToastTone;
export type { ToastAction };

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
  showErrorWithRetry: (message: string, retryFn: () => void) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const VALUE: ToastContextValue = {
  showToast,
  showErrorWithRetry: (message, retryFn) => showToast(message, 'error', { label: 'Retry', onClick: retryFn }),
  dismissToast,
  clearToasts: () => dismissToast(),
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ToastContext.Provider value={VALUE}>{children}</ToastContext.Provider>
);

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;
