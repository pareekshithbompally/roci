/** Error boundary so a ProvidersPanel crash doesn't take down the app. */

import React, { Component, type ReactNode } from 'react';
import { Button, Callout, Surface, Text } from '@shared/ui';

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
      localStorage.removeItem('roci_last_provider_selection');
      localStorage.removeItem('roci_model_providers');
      window.location.reload();
    } catch (error) {
      console.error('[ProvidersPanelErrorBoundary] Failed to reset:', error);
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="max-w-md">
          <Callout variant="error">
            <div className="space-y-4">
              <div>
                <Text as="h3" variant="title" tone="inherit" className="mb-2">Provider Settings Error</Text>
                <Text as="p" tone="inherit">
                  An error occurred while loading the provider settings. This might be due to corrupted data.
                </Text>
              </div>
              {this.state.error && (
                <details>
                  <summary className="cursor-pointer hover:underline">
                    <Text variant="helper" tone="inherit">Error details</Text>
                  </summary>
                  <Surface variant="subtle" radius="md" className="mt-2 p-2 overflow-auto">
                    <Text as="p" variant="mono" tone="inherit" className="whitespace-pre-wrap">{this.state.error.message}</Text>
                  </Surface>
                </details>
              )}
              <div className="space-y-2">
                <Button variant="danger" size="md" className="w-full" onClick={this.handleReset}>
                  Reset Provider Settings
                </Button>
                <Text as="p" variant="helper" tone="inherit">
                  This will clear all provider configurations and reload the page.
                </Text>
              </div>
            </div>
          </Callout>
        </div>
      </div>
    );
  }
}
