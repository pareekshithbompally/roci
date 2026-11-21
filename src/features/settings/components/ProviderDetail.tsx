/** The selected provider: a header with its one enable switch, then its connection settings and models. */

import React from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersAvatar } from '@shared/components';
import { canListModels } from '@shared/utils/modelResolver';
import { getProviderTitle, isKnownPortServer, isLocalProviderId, serverAppOf } from '@shared/utils/provider.utils';
import { Card, CardRow, ICON_TILE_PX, Picker, Section, Switch } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';
import { SERVER_APP_PICKER, SERVER_APPS } from '@config/localServers.config';
import { serverHost } from '@services/providers/localServers';
import type { ModelProvider } from '@shared/types/modelProviders';
import { useProviderConnection } from '@features/settings/hooks/useProviderConnection';
import { ProviderConnection } from './ProviderConnection';
import { ProviderModels } from './ProviderModels';

interface ProviderDetailProps {
  provider: ModelProvider;
}

/** Test and Add model share one model-list query: either one loads it, both read it. */
const ListedProviderDetail: React.FC<ProviderDetailProps> = ({ provider }) => {
  const connection = useProviderConnection(provider);
  return (
    <>
      <ProviderConnection provider={provider} connection={connection} />
      <ProviderModels provider={provider} connection={connection} />
    </>
  );
};

const OTHER_APP = 'other';

const SERVER_APP_OPTIONS = [
  ...SERVER_APPS.map((app) => ({ value: app.id, label: app.label })),
  { value: OTHER_APP, label: SERVER_APP_PICKER.other },
];

/** Which app a server on its own port is: its name and logo everywhere; Other keeps its address as its name. */
const ServerAppRow: React.FC<ProviderDetailProps> = ({ provider }) => {
  const { updateProvider } = useSettings();
  const id = provider.provider;
  return (
    <Section>
      <CardRow
        title={SERVER_APP_PICKER.title}
        actions={
          <div className={LAYOUT.capabilityPicker}>
            <Picker
              label={SERVER_APP_PICKER.title}
              value={provider.server_app ?? OTHER_APP}
              onChange={(value) => updateProvider(id, { server_app: value === OTHER_APP ? undefined : value })}
              placeholder=""
              groups={[{ options: SERVER_APP_OPTIONS }]}
            />
          </div>
        }
      />
    </Section>
  );
};

/**
 * Local servers: which app they are (unless found on that app's own port), their settings, and the models the live probe syncs (no Test; the probe is the check).
 * Cloud providers that can list models: Test, and Add model from that list. Speech-only providers (Deepgram,
 * ElevenLabs): the key, and models added by name.
 */
const ProviderBody: React.FC<ProviderDetailProps> = ({ provider }) => {
  if (isLocalProviderId(provider.provider)) {
    return (
      <>
        {!isKnownPortServer(provider.provider) && <ServerAppRow provider={provider} />}
        <ProviderConnection provider={provider} />
        <ProviderModels provider={provider} />
      </>
    );
  }
  if (canListModels(provider)) return <ListedProviderDetail provider={provider} />;
  return (
    <>
      <ProviderConnection provider={provider} />
      <ProviderModels provider={provider} addByName />
    </>
  );
};

export const ProviderDetail: React.FC<ProviderDetailProps> = ({ provider }) => {
  const { updateProvider } = useSettings();
  const id = provider.provider;
  const title = getProviderTitle(id);

  return (
    <>
      <Card>
        <CardRow
          leading={<ProvidersAvatar provider={id} size={ICON_TILE_PX} />}
          title={title}
          description={serverAppOf(id) && provider.base_url ? serverHost(provider.base_url) : undefined}
          actions={
            <Switch
              checked={provider.active}
              onCheckedChange={(active) => updateProvider(id, { active })}
              aria-label={`Enable ${title}`}
            />
          }
        />
      </Card>
      <ProviderBody key={id} provider={provider} />
    </>
  );
};
