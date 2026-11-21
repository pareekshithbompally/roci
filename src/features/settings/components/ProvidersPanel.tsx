/** Settings › Providers: On this device, the cloud providers and your servers as rows; a row drills into its page (usePaneDrill). */

import React from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { ProvidersAvatar } from '@shared/components';
import { CardRow, ICON_TILE_PX, Section } from '@shared/ui';
import { ProviderStatus, cloudRowState } from './ProviderStatus';
import { ADD_SERVER_TITLE, AddServerForm, ServersSection } from './LocalServersSection';
import { ProviderDetail } from './ProviderDetail';
import { OnDeviceDetail } from './OnDeviceDetail';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { SettingsPage, usePaneDrill, type DrillPage } from './shared';

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
    leading={<ProvidersAvatar provider={id} size={ICON_TILE_PX} />}
    status={status}
    onOpen={() => open(id)}
  />
);

export const ProvidersPanel: React.FC = () => {
  const { providers } = useSettings();
  const drill = usePaneDrill();
  if (drill.view) return drill.view;

  const providerPage = (id: string): DrillPage => ({
    title: getProviderTitle(id),
    render: (close) => <ProviderPage id={id} onBack={close} />,
  });
  const openProvider = (id: string) => drill.open(providerPage(id));
  const addServerPage: DrillPage = {
    title: ADD_SERVER_TITLE,
    render: (close) => (
      <SettingsPage title={ADD_SERVER_TITLE} onBack={close}>
        <AddServerForm onAdded={(id) => { close(); openProvider(id); }} onCancel={close} />
      </SettingsPage>
    ),
  };

  return (
    <SettingsPage pane="providers" onForward={drill.forward}>
      <Section>{providerRow(ON_DEVICE_ID, openProvider)}</Section>
      <Section title="Cloud">
        {providers
          .filter((p) => !isLocalProviderId(p.provider))
          .map((p) => providerRow(p.provider, openProvider, <ProviderStatus state={cloudRowState(p)} />))}
      </Section>
      <ServersSection onOpen={openProvider} onAdd={() => drill.open(addServerPage)} />
    </SettingsPage>
  );
};

export default ProvidersPanel;
