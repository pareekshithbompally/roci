/** Settings › Providers › Connection: base URL (custom providers), API key, and a Test of the key. */

import React from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isManagedSDK } from '@shared/utils/modelResolver';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { CardRow, Section, Status } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ConnectionStatus, ProviderConnection as Connection } from '@features/settings/hooks/useProviderConnection';
import { renderWithLinks } from '@shared/components';
import { formatRelativeTime } from '@shared/utils/formatters';
import { FieldRow } from '@shared/components';

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

const modelCount = (n: number) => `${n} ${n === 1 ? 'model' : 'models'}`;

function statusView(status: ConnectionStatus): StatusView {
  switch (status.state) {
    case 'incomplete':
      return { label: 'Not set up', tone: 'muted' };
    case 'untested':
      return { label: 'Not tested', tone: 'muted' };
    case 'checking':
      return { label: 'Checking…', tone: 'info', pulse: true };
    case 'connected':
      return { label: `Connected · ${modelCount(status.models.length)}`, tone: 'success' };
    case 'failed':
      return { label: 'Failed', tone: 'danger' };
    case 'checked': {
      // a test from an earlier session, said with when it ran
      const { ok, at, models } = status.check;
      const when = `tested ${formatRelativeTime(at)}`;
      return ok
        ? { label: ['Connected', models === undefined ? null : modelCount(models), when].filter(Boolean).join(' · '), tone: 'success' }
        : { label: `Failed · ${when}`, tone: 'danger' };
    }
  }
}

function testDescription(status: ConnectionStatus, title: string, needsUrl: boolean): string {
  if (status.state === 'failed') return status.message;
  if (status.state === 'checked' && !status.check.ok && status.check.message) return status.check.message;
  if (status.state === 'incomplete') return needsUrl ? 'Add the base URL and API key, then Test.' : 'Add your API key, then Test.';
  return `Checks your key by listing ${title}'s models.`;
}

/** The key's state as a value, then Test Connection as a tinted action row (iOS). */
const TestRows: React.FC<{ connection: Connection }> = ({ connection: { status, test } }) => {
  const { label, tone, pulse } = statusView(status);
  const canTest = status.state !== 'incomplete' && status.state !== 'checking';
  return (
    <>
      <CardRow title="Status" actions={<Status tone={tone} pulse={pulse}>{label}</Status>} />
      <CardRow title="Test Connection" tone={canTest ? 'accent' : undefined} onPress={canTest ? test : undefined} />
    </>
  );
};

export const ProviderConnection: React.FC<ProviderConnectionProps> = ({ provider, connection }) => {
  const { updateProviderSetting } = useSettings();
  const managed = isManagedSDK(provider.provider);
  // Each field's help reads under the group (System Settings footer), not inside the card.
  const fieldHelp = provider.settings
    .filter((setting) => !(managed && setting.key === 'base-url'))
    .map((setting) => setting.description)
    .filter((help): help is string => !!help);

  return (
    <Section
      title="Connection"
      footer={(
        <>
          {fieldHelp.map((help, i) => <React.Fragment key={i}>{renderWithLinks(help)} </React.Fragment>)}
          {connection && testDescription(connection.status, getProviderTitle(provider.provider), !managed)}
        </>
      )}
    >
      {provider.settings.map((setting, index) => {
        if (managed && setting.key === 'base-url') return null;
        const value = (setting.controller_props.value as string) || '';
        const placeholder = setting.controller_props.placeholder;
        const update = (next: string) => updateProviderSetting(provider.provider, index, next);
        return (
          <FieldRow key={setting.key} title={setting.title} kind={setting.key === 'api-key' ? 'secret' : 'url'} value={value} placeholder={placeholder} onChange={update} />
        );
      })}
      {connection && <TestRows connection={connection} />}
    </Section>
  );
};
