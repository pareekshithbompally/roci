/**
 * Error Boundary for ProvidersPanel
 * Catches and displays errors gracefully without crashing the entire app
 */

import React, { Component, type ReactNode } from 'react';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ProvidersPanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ProvidersPanelErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    try {
      localStorage.removeItem('kasset_ai_last_provider_selection');
      localStorage.removeItem('kasset_ai_model_providers');
      window.location.reload();
    } catch (error) {
      console.error('[ProvidersPanelErrorBoundary] Failed to reset:', error);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="max-w-md space-y-4">
            <div className={`${SURFACE.errorCallout} border ${BORDER.errorCallout} ${RADIUS.lg} p-6`}>
              <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} ${TEXT.errorCallout} mb-2`}>
                Provider Settings Error
              </h3>
              <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.errorCallout} mb-4`}>
                An error occurred while loading the provider settings. This might be due to corrupted data.
              </p>
              {this.state.error && (
                <details className="mb-4">
                  <summary className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.error} cursor-pointer hover:underline`}>
                    Error details
                  </summary>
                  <pre className={`mt-2 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.error} overflow-auto p-2 ${SURFACE.errorCallout} ${RADIUS.md}`}>
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              <button
                onClick={this.handleReset}
                className={`w-full px-4 py-2 ${COMPONENT.dangerButton} ${RADIUS.md} ${TYPOGRAPHY_CLASSES.settingsButton}`}
              >
                Reset Provider Settings
              </button>
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.error} mt-2`}>
                This will clear all provider configurations and reload the page.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
