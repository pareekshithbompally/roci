/** Master-detail providers layout; selectedProviderName is the source of truth, localStorage seeds first mount. */

import React, { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { ProvidersAvatar } from '@shared/components';
import { Card, CardRow, ScrollArea, Text, useNavStack } from '@shared/ui';
import type { ModelProvider } from '@shared/types/modelProviders';
import { ProviderGroup, ProviderListItem, ProviderStatus, cloudRowState } from './ProviderListItem';
import { LocalServersSection, PhoneServersSection } from './LocalServersSection';
import { ProviderDetail } from './ProviderDetail';
import { OnDeviceDetail } from './OnDeviceDetail';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { SettingsPage } from './shared';
import { useFormFactor } from '@platform/formFactor';

const STORAGE_KEY = 'roci_last_provider_selection';
const ON_DEVICE_ID = LOCAL_MODELS_CONFIG.provider.id;

/** The models on this device on their own screen. */
const OnDeviceScreen: React.FC = () => (
  <div className="flex flex-col gap-6 p-4">
    <OnDeviceDetail />
  </div>
);

/** A provider's detail on its own screen; reads the provider by id so edits show at once. */
const ProviderDetailScreen: React.FC<{ id: string }> = ({ id }) => {
  const provider = useSettings().providers.find((p) => p.provider === id);
  return provider ? (
    <div className="flex flex-col gap-6 p-4">
      <ProviderDetail provider={provider} />
    </div>
  ) : null;
};

/** Phone: in the shared page frame, On this device, one row per provider (logo, name, state), then Your Servers; a row pushes its detail. */
const PhoneProviders: React.FC<{ providers: ModelProvider[] }> = ({ providers }) => {
  const { push } = useNavStack();
  const open = (id: string) => push({ title: getProviderTitle(id), content: <ProviderDetailScreen id={id} /> });

  return (
    <SettingsPage pane="providers">
      <Card>
        <CardRow
          title={getProviderTitle(ON_DEVICE_ID)}
          leading={<ProvidersAvatar provider={ON_DEVICE_ID} size={20} />}
          onOpen={() => push({ title: getProviderTitle(ON_DEVICE_ID), content: <OnDeviceScreen /> })}
        />
      </Card>
      <Card>
        {providers.map((provider) => (
          <CardRow
            key={provider.provider}
            title={getProviderTitle(provider.provider)}
            leading={<ProvidersAvatar provider={provider.provider} size={20} />}
            status={<ProviderStatus state={cloudRowState(provider)} />}
            onOpen={() => open(provider.provider)}
          />
        ))}
      </Card>
      <PhoneServersSection onOpen={open} />
    </SettingsPage>
  );
};

export const ProvidersPanel: React.FC = () => {
  const { providers, selectedProviderName, setSelectedProviderName } = useSettings();
  const formFactor = useFormFactor();

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

  if (formFactor === 'phone') return <PhoneProviders providers={cloudProviders} />;

  return (
    <SettingsPage pane="providers" layout="fill">
      <div className="flex min-h-0 w-full flex-1 gap-6">
        <ScrollArea className="w-56 shrink-0 space-y-4">
          <ProviderListItem
            provider={ON_DEVICE_ID}
            selected={effectiveSelectedProvider === ON_DEVICE_ID}
            state="ready"
            onSelect={() => setSelectedProviderName(ON_DEVICE_ID)}
          />
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
          {effectiveSelectedProvider === ON_DEVICE_ID ? (
            <OnDeviceDetail />
          ) : selectedProvider ? (
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
