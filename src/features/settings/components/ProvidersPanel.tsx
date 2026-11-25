/** Settings › Providers: On this device, the cloud providers and your servers as rows; a row drills into its page (usePaneDrill). */

import React, { useState } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { ProvidersAvatar } from '@shared/components';
import { CardRow, Section } from '@shared/ui';
import { ProviderStatus, cloudRowState } from './ProviderStatus';
import { AddServerForm, ServersSection } from './LocalServersSection';
import { ProviderDetail } from './ProviderDetail';
import { OnDeviceDetail } from './OnDeviceDetail';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { PROVIDERS_LIST } from '@config/providers.config';
import { SettingsPage, usePaneDrill, type DrillPage } from './shared';
import { useSettingsPage } from '@shared/stores/appStore';

const ON_DEVICE_ID = LOCAL_MODELS_CONFIG.provider.id;

/** A provider's page under its name; reads the provider by id so edits show at once. */
const ProviderPage: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const provider = useSettings().providers.find((p) => p.provider === id);
  return (
    <SettingsPage title={getProviderTitle(id)} onBack={onBack}>
      {id === ON_DEVICE_ID ? <OnDeviceDetail /> : provider && <ProviderDetail provider={provider} />}
    </SettingsPage>
  );
};

const providerRow = (id: string, open: (id: string) => void, status?: React.ReactNode) => (
  <CardRow
    key={id}
    title={getProviderTitle(id)}
    leading={<ProvidersAvatar provider={id} />}
    status={status}
    onOpen={() => open(id)}
  />
);

const providerPage = (id: string): DrillPage => ({
  title: getProviderTitle(id),
  render: (close) => <ProviderPage id={id} onBack={close} />,
});

export const ProvidersPanel: React.FC = () => {
  const { providers } = useSettings();
  const requested = useSettingsPage();
  const drill = usePaneDrill(requested ? providerPage(requested) : null);
  const [adding, setAdding] = useState(false);
  if (drill.view) return drill.view;

  const openProvider = (id: string) => drill.open(providerPage(id));

  return (
    <SettingsPage pane="providers" onForward={drill.forward}>
      <Section footer={PROVIDERS_LIST.onDeviceFooter}>{providerRow(ON_DEVICE_ID, openProvider)}</Section>
      <Section title={PROVIDERS_LIST.cloudTitle} footer={PROVIDERS_LIST.cloudFooter}>
        {providers
          .filter((p) => !isLocalProviderId(p.provider))
          .map((p) => providerRow(p.provider, openProvider, <ProviderStatus state={cloudRowState(p)} />))}
      </Section>
      <ServersSection onOpen={openProvider} onAdd={() => setAdding(true)} />
      <AddServerForm open={adding} onOpenChange={setAdding} onAdded={(id) => { setAdding(false); openProvider(id); }} />
    </SettingsPage>
  );
};

export default ProvidersPanel;
