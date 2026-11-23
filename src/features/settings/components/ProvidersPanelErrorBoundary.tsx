/** Error boundary so a ProvidersPanel crash doesn't take down the app. */

import React, { Component, type ReactNode } from 'react';
import { Button, Callout, Surface, Text } from '@shared/ui';
import { PROVIDER_COPY } from '@config/settingsCopy.config';

const COPY = PROVIDER_COPY.crashed;

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

  /** Shows the panel again; the providers in roci.db are left as they are. */
  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="max-w-md">
          <Callout variant="error">
            <div className="space-y-4">
              <div>
                <Text as="h3" variant="title" tone="inherit" className="mb-2">{COPY.title}</Text>
                <Text as="p" tone="inherit">{COPY.description}</Text>
              </div>
              {this.state.error && (
                <details>
                  <summary className="cursor-pointer hover:underline">
                    <Text variant="helper" tone="inherit">{COPY.details}</Text>
                  </summary>
                  <Surface variant="subtle" radius="md" className="mt-2 p-2 overflow-auto">
                    <Text as="p" variant="mono" tone="inherit" className="whitespace-pre-wrap">{this.state.error.message}</Text>
                  </Surface>
                </details>
              )}
              <Button variant="outline" size="md" className="w-full" onClick={this.handleRetry}>{COPY.retry}</Button>
            </div>
          </Callout>
        </div>
      </div>
    );
  }
}
