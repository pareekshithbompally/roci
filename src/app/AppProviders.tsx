/**
 * AppProviders.tsx - All Context Providers
 * 
 * Composes all context providers into a single wrapper.
 * Order matters: outer providers are available to inner providers.
 * 
 * Provider order (outer → inner):
 * 1. ErrorBoundary - Debugging error boundary
 * 2. ThemeProvider - Basic theming, no dependencies
 * 3. ToastProvider - Notifications, no dependencies
 *    TooltipProvider - shared hover delay for every @shared/ui Tooltip
 * 4. QueryClientProvider - TanStack Query for server/disk data
 * 5. SettingsProvider - App settings, needed by others (save-on-edit, no dirty tracking)
 * 6. HistoryProvider - History management
 * 7. ImportProvider - Audio/transcript file import
 * 8. ChatProvider - Chat functionality
 * 9. RecordingProvider - Recording functionality (with context dependencies)
 *
 * Note: appStore (Zustand) replaces AppContext; useMeetingNotes/useMeetingTodos
 * (TanStack Query) replace MeetingContext, NotesContext, TodosContext.
 */

import React, { ReactNode, Component, ErrorInfo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@shared/contexts/ThemeContext';
import { ToastProvider } from '@shared/contexts/ToastContext';
import { SettingsProvider, useSettings } from '@shared/contexts/SettingsContext';
import { HistoryProvider, useHistory } from '@shared/contexts/HistoryContext';
import { ChatProvider } from '@shared/contexts/ChatContext';
import { RecordingProvider } from '@features/recording';
import { ImportProvider } from '@features/import';
import { queryClient } from '@shared/query/queryClient';
import { Surface, Text, TooltipProvider } from '@shared/ui';
import { useAppActions } from '@shared/stores/appStore';

/**
 * Error Boundary for debugging render errors
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Surface variant="page" className="p-5 h-screen overflow-auto">
          <Text as="h1" variant="title" tone="danger">Something went wrong</Text>
          <Text as="div" variant="mono" tone="danger" className="mt-3 whitespace-pre-wrap">
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
            {'\n\nComponent Stack:'}
            {this.state.errorInfo?.componentStack}
          </Text>
        </Surface>
      );
    }
    return this.props.children;
  }
}

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * RecordingProviderWrapper
 * 
 * Wrapper component that injects context dependencies into RecordingProvider.
 * Must be inside Settings, History, App, and Toast providers to access their contexts.
 */
const RecordingProviderWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  const settingsContext = useSettings();
  const historyContext = useHistory();
  const appContext = useAppActions();

  return (
    <RecordingProvider
      settingsContext={settingsContext}
      historyContext={historyContext}
      appContext={appContext}
    >
      {children}
    </RecordingProvider>
  );
};

/**
 * AppProviders
 * 
 * Wrap the app root with this component to enable all context providers.
 * 
 * @example
 * ```tsx
 * <AppProviders>
 *   <App />
 * </AppProviders>
 * ```
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <TooltipProvider>
            <QueryClientProvider client={queryClient}>
              <SettingsProvider>
                <HistoryProvider>
                  <ImportProvider>
                    <ChatProvider>
                      <RecordingProviderWrapper>
                        {children}
                      </RecordingProviderWrapper>
                    </ChatProvider>
                  </ImportProvider>
                </HistoryProvider>
              </SettingsProvider>
            </QueryClientProvider>
          </TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default AppProviders;
