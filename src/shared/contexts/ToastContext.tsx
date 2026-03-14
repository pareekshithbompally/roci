/**
 * Toast Context
 *
 * Centralized toast API over Sonner. All components should use
 * useToast().showToast() instead of importing sonner directly.
 *
 * Provides consistent icons (white Lucide, 16px) and richColors
 * styling for every toast type. Sonner's <Toaster> is rendered in App.tsx.
 */

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

const TOAST_ICONS: Record<ToastType, React.ReactElement> = {
  success: React.createElement(CheckCircle2, { size: 16, color: 'white' }),
  error: React.createElement(XCircle, { size: 16, color: 'white' }),
  info: React.createElement(Info, { size: 16, color: 'white' }),
  warning: React.createElement(AlertTriangle, { size: 16, color: 'white' }),
};

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const opts = { icon: TOAST_ICONS[type] };
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

  const dismissToast = useCallback((id: string) => {
    sonnerToast.dismiss(id);
  }, []);

  const clearToasts = useCallback(() => {
    sonnerToast.dismiss();
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, clearToasts }}>
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
