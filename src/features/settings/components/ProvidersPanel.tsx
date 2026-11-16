/** Master-detail providers layout; selectedProviderName is the source of truth, localStorage seeds first mount. */

import React, { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isLocalProviderId, providerSetting } from '@shared/utils/provider.utils';
import { ScrollArea, Text } from '@shared/ui';
import type { ModelProvider } from '@shared/types/modelProviders';
import { ProviderGroup, ProviderListItem } from './ProviderListItem';
import type { ProviderRowState } from './ProviderListItem';
import { LocalServersSection } from './LocalServersSection';
import { ProviderDetail } from './ProviderDetail';
import { SettingsPage } from './shared';

const STORAGE_KEY = 'kasset_ai_last_provider_selection';

function cloudRowState(provider: ModelProvider): ProviderRowState {
  if (!provider.active) return 'off';
  return providerSetting(provider, 'api-key') ? 'ready' : 'attention';
}

export const ProvidersPanel: React.FC = () => {
  const { providers, selectedProviderName, setSelectedProviderName } = useSettings();

  // Initialize selectedProviderName: context first, localStorage fallback
  const effectiveSelectedProvider = selectedProviderName
    || (() => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.providerName || null;
          }
        } catch { /* ignore */ }
        return null;
      })()
    || providers[0]?.provider
    || null;

  // Sync to localStorage whenever it changes
  useEffect(() => {
    if (effectiveSelectedProvider) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          providerName: effectiveSelectedProvider,
        }));
      } catch { /* ignore */ }
    }
  }, [effectiveSelectedProvider]);

  const selectedProvider = effectiveSelectedProvider
    ? providers.find(p => p.provider === effectiveSelectedProvider)
    : null;

  const cloudProviders = providers.filter(p => !isLocalProviderId(p.provider));

  return (
    <SettingsPage
      title="Model Providers"
      description="Turn on a provider, add its API key, and test it to choose models."
      layout="fill"
    >
      <div className="flex min-h-0 w-full gap-6">
        <ScrollArea className="w-56 shrink-0 space-y-4">
          <ProviderGroup title="Cloud">
            {cloudProviders.map((provider) => (
              <ProviderListItem
                key={provider.provider}
                provider={provider.provider}
                selected={effectiveSelectedProvider === provider.provider}
                state={cloudRowState(provider)}
                onSelect={() => setSelectedProviderName(provider.provider)}
              />
            ))}
          </ProviderGroup>
          <LocalServersSection selectedProvider={effectiveSelectedProvider} onSelect={setSelectedProviderName} />
        </ScrollArea>

        <ScrollArea className="flex-1 min-w-0 space-y-6">
          {selectedProvider ? (
            <ProviderDetail provider={selectedProvider} />
          ) : (
            <Text as="div" tone="faint" className="flex items-center justify-center py-12">
              Select a provider to configure
            </Text>
          )}
        </ScrollArea>
      </div>
    </SettingsPage>
  );
};

export default ProvidersPanel;
