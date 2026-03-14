/**
 * AppProviders.tsx - All Context Providers
 * 
 * Composes all context providers into a single wrapper.
 * Order matters: outer providers are available to inner providers.
 * 
 * Provider order (outer → inner):
 * 1. ThemeProvider - Basic theming, no dependencies
 * 2. ToastProvider - Notifications, no dependencies
 * 3. SettingsProvider - App settings, needed by others
 * 4. UnsavedChangesProvider - Settings unsaved state tracking
 * 5. AppProvider - App-wide state
 * 6. HistoryProvider - History management
 * 7. MeetingProvider - Current meeting state
 * 8. NotesProvider - Notes management for current meeting
 * 9. TodosProvider - Todos management for current meeting
 * 10. ChatProvider - Chat functionality
 * 11. RecordingProvider - Recording functionality (with context dependencies)
 */

import React, { ReactNode, Component, ErrorInfo } from 'react';
import { ThemeProvider } from '../shared/contexts/ThemeContext';
import { ToastProvider } from '../shared/contexts/ToastContext';
import { AppProvider, useApp } from '../shared/contexts/AppContext';
import { SettingsProvider, useSettings } from '../shared/contexts/SettingsContext';
import { UnsavedChangesProvider } from '../shared/contexts/UnsavedChangesContext';
import { HistoryProvider, useHistory } from '../shared/contexts/HistoryContext';
import { MeetingProvider, useMeeting } from '../shared/contexts/MeetingContext';
import { NotesProvider } from '../features/notes';
import { TodosProvider } from '../features/todos';
import { ChatProvider } from '../shared/contexts/ChatContext';
import { RecordingProvider } from '../features/recording';

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
        <div style={{ padding: 20, fontFamily: 'monospace', background: '#fef2f2', color: '#dc2626' }}>
          <h1>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
            {'\n\nComponent Stack:'}
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * MeetingDataProviders
 * 
 * Wrapper component that connects MeetingContext to Notes/Todos providers.
 * Must be inside MeetingProvider to access current meeting ID.
 */
const MeetingDataProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { selectedHistoryId } = useMeeting();

  return (
    <NotesProvider meetingId={selectedHistoryId}>
      <TodosProvider meetingId={selectedHistoryId}>
        {children}
      </TodosProvider>
    </NotesProvider>
  );
};

/**
 * RecordingProviderWrapper
 * 
 * Wrapper component that injects context dependencies into RecordingProvider.
 * Must be inside Settings, History, App, and Toast providers to access their contexts.
 */
const RecordingProviderWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  const settingsContext = useSettings();
  const historyContext = useHistory();
  const appContext = useApp();

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
          <SettingsProvider>
            <UnsavedChangesProvider>
              <AppProvider>
                <HistoryProvider>
                  <MeetingProvider>
                    <MeetingDataProviders>
                      <ChatProvider>
                        <RecordingProviderWrapper>
                          {children}
                        </RecordingProviderWrapper>
                      </ChatProvider>
                    </MeetingDataProviders>
                  </MeetingProvider>
                </HistoryProvider>
              </AppProvider>
            </UnsavedChangesProvider>
          </SettingsProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default AppProviders;
