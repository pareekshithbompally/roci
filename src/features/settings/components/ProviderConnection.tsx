/** Settings › Providers › Connection: base URL (custom providers), API key, and a Test of the key. */

import React from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isManagedSDK } from '@shared/utils/modelResolver';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { CardRow, Section, Status } from '@shared/ui';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ConnectionStatus, ProviderConnection as Connection } from '@features/settings/hooks/useProviderConnection';
import { renderWithLinks } from '@shared/components';
import { formatRelativeTime } from '@shared/utils/formatters';
import { FieldRow } from '@shared/components';
import { PROVIDER_COPY } from '@config/settingsCopy.config';
import { META_SEPARATOR } from '@config/ui.config';
import type { StateKind } from '@config/states.config';

interface ProviderConnectionProps {
  provider: ModelProvider;
  /** The key test; absent for providers whose models can't be listed (speech-only). */
  connection?: Connection;
}

interface StatusView {
  label: string;
  state: StateKind;
}

const COPY = PROVIDER_COPY;
const { modelCount } = COPY;
const STATE = COPY.state;

function statusView(status: ConnectionStatus): StatusView {
  switch (status.state) {
    case 'incomplete':
      return { label: STATE.notSetUp, state: 'idle' };
    case 'untested':
      return { label: STATE.notTested, state: 'idle' };
    case 'checking':
      return { label: STATE.checking, state: 'preparing' };
    case 'connected':
      return { label: [STATE.connected, modelCount(status.models.length)].join(META_SEPARATOR), state: 'ready' };
    case 'failed':
      return { label: STATE.failed, state: 'failed' };
    case 'checked': {
      // a test from an earlier session, said with when it ran
      const { ok, at, models } = status.check;
      const when = COPY.tested(formatRelativeTime(at));
      return ok
        ? { label: [STATE.connected, models === undefined ? null : modelCount(models), when].filter(Boolean).join(META_SEPARATOR), state: 'ready' }
        : { label: [STATE.failed, when].join(META_SEPARATOR), state: 'failed' };
    }
  }
}

function testDescription(status: ConnectionStatus, title: string, needsUrl: boolean): string {
  if (status.state === 'failed') return status.message;
  if (status.state === 'checked' && !status.check.ok && status.check.message) return status.check.message;
  if (status.state === 'incomplete') return needsUrl ? COPY.needsUrlAndKey : COPY.needsKey;
  return COPY.testExplains(title);
}

/** The key's state as a value, then Test Connection as a tinted action row (iOS). */
const TestRows: React.FC<{ connection: Connection }> = ({ connection: { status, test } }) => {
  const { label, state } = statusView(status);
  const canTest = status.state !== 'incomplete' && status.state !== 'checking';
  return (
    <>
      <CardRow title={COPY.status} actions={<Status state={state}>{label}</Status>} />
      <CardRow title={COPY.testConnection} tone={canTest ? 'accent' : undefined} onPress={canTest ? test : undefined} />
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
      title={COPY.connection}
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
