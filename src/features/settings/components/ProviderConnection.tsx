/** Settings › Providers › Connection: base URL (custom providers), API key, and a Test of the key. */

import React from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isManagedSDK } from '@shared/utils/modelResolver';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Button, CardRow, Section, Status } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ConnectionStatus, ProviderConnection as Connection } from '@features/settings/hooks/useProviderConnection';
import { SecretInput, SettingsInput } from './shared';

interface ProviderConnectionProps {
  provider: ModelProvider;
  /** The key test; absent for providers whose models can't be listed (speech-only). */
  connection?: Connection;
}

interface StatusView {
  label: string;
  tone: DotTone;
  pulse?: boolean;
}

function statusView(status: ConnectionStatus): StatusView {
  switch (status.state) {
    case 'incomplete':
      return { label: 'Not set up', tone: 'muted' };
    case 'untested':
      return { label: 'Not tested', tone: 'muted' };
    case 'checking':
      return { label: 'Checking…', tone: 'info', pulse: true };
    case 'connected':
      return { label: `Connected · ${status.modelIds.length} ${status.modelIds.length === 1 ? 'model' : 'models'}`, tone: 'success' };
    case 'failed':
      return { label: 'Failed', tone: 'danger' };
  }
}

function testDescription(status: ConnectionStatus, title: string, needsUrl: boolean): string {
  if (status.state === 'failed') return status.message;
  if (status.state === 'incomplete') return needsUrl ? 'Add the base URL and API key, then Test.' : 'Add your API key, then Test.';
  return `Checks your key by listing ${title}'s models.`;
}

const TestRow: React.FC<{ connection: Connection }> = ({ connection: { status, test } }) => {
  const { label, tone, pulse } = statusView(status);
  return (
    <CardRow
      title="Test connection"
      status={<Status tone={tone} pulse={pulse}>{label}</Status>}
      actions={
        <Button variant="outline" size="sm" onClick={test} disabled={status.state === 'incomplete' || status.state === 'checking'}>
          Test
        </Button>
      }
    />
  );
};

export const ProviderConnection: React.FC<ProviderConnectionProps> = ({ provider, connection }) => {
  const { updateProviderSetting } = useSettings();
  const managed = isManagedSDK(provider.provider);

  return (
    <Section
      title="Connection"
      footer={connection && testDescription(connection.status, getProviderTitle(provider.provider), !managed)}
    >
      {provider.settings.map((setting, index) => {
        if (managed && setting.key === 'base-url') return null;
        const value = (setting.controller_props.value as string) || '';
        const input = {
          value,
          placeholder: setting.controller_props.placeholder,
          label: setting.title,
          helper: setting.description,
        };
        return (
          <div key={setting.key} className="py-3">
            {setting.key === 'api-key' ? (
              <SecretInput {...input} onChange={(next) => updateProviderSetting(provider.provider, index, next)} />
            ) : (
              <SettingsInput {...input} onChange={(e) => updateProviderSetting(provider.provider, index, e.target.value)} />
            )}
          </div>
        );
      })}
      {connection && <TestRow connection={connection} />}
    </Section>
  );
};
