/** The selected provider: a header with its one enable switch, then its connection settings and models. */

import React from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersAvatar } from '@shared/components';
import { canListModels } from '@shared/utils/modelResolver';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { Card, CardRow, Switch } from '@shared/ui';
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

/**
 * Local servers: their settings, and the models the live probe syncs (no Test; the probe is the check).
 * Cloud providers that can list models: Test, and Add model from that list. Speech-only providers (Deepgram,
 * ElevenLabs): the key alone; their models are picked in Transcription.
 */
const ProviderBody: React.FC<ProviderDetailProps> = ({ provider }) => {
  if (isLocalProviderId(provider.provider)) {
    return (
      <>
        <ProviderConnection provider={provider} />
        <ProviderModels provider={provider} />
      </>
    );
  }
  if (canListModels(provider)) return <ListedProviderDetail provider={provider} />;
  return <ProviderConnection provider={provider} />;
};

export const ProviderDetail: React.FC<ProviderDetailProps> = ({ provider }) => {
  const { updateProvider } = useSettings();
  const id = provider.provider;
  const title = getProviderTitle(id);

  return (
    <>
      <Card>
        <CardRow
          leading={<ProvidersAvatar provider={id} size={20} />}
          title={title}
          actions={
            <Switch
              size="sm"
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
