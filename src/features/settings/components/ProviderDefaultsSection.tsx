/** Provider defaults: a row per provider's set (its logo and name, In Use on the one in use) that opens a page listing every
 *  job's model and Use … Defaults. Below it, the page's job sections are headed "Build your own". */

import React from 'react';
import { CardRow, Section, Spinner, Text } from '@shared/ui';
import { ProvidersAvatar } from '@shared/components';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { useProviderDefaultRows } from '@features/settings/hooks/useProviderDefaultRows';
import type { ProviderDefaultRow } from '@features/settings/hooks/useProviderDefaultRows';
import { DefaultsList } from './DefaultsList';
import { SettingsPage } from './shared';

const COPY = DEFAULT_MODELS_CONFIG.providerDefaults;

/** The button row's title: Use … Defaults, Download and Use for this device's models, In Use once chosen. */
function actionLabel(row: ProviderDefaultRow): string {
  if (row.inUse) return COPY.inUse;
  return row.downloads ? COPY.downloadAndUse : COPY.useDefaults(row.title);
}

/** One set's page: every job's model, then the one action. Reads the row by key so it updates once used. */
export const ProviderDefaultsPage: React.FC<{ rowKey: string; onBack: () => void }> = ({ rowKey, onBack }) => {
  const row = useProviderDefaultRows().find((r) => r.key === rowKey);
  if (!row) return null;
  return (
    <SettingsPage title={row.title} onBack={onBack}>
      <DefaultsList defaults={row.defaults} footer={COPY.pageFooter} />
      <Section footer={row.downloads && !row.inUse ? COPY.downloadNote : undefined}>
        <CardRow
          title={actionLabel(row)}
          tone={row.inUse ? undefined : 'accent'}
          status={row.busy ? <Spinner size="sm" /> : undefined}
          disabled={row.inUse || row.busy || !row.defaults.chat}
          onPress={row.use}
        />
      </Section>
    </SettingsPage>
  );
};

export const ProviderDefaultsSection: React.FC<{ onOpen: (row: ProviderDefaultRow) => void }> = ({ onOpen }) => {
  const rows = useProviderDefaultRows();
  if (rows.length === 0) return null;
  return (
    <>
      <Section title={COPY.section} footer={COPY.footer}>
        {rows.map((row) => (
          <CardRow
            key={row.key}
            leading={<ProvidersAvatar provider={row.provider} />}
            title={row.title}
            value={row.inUse ? COPY.inUse : undefined}
            onOpen={() => onOpen(row)}
          />
        ))}
      </Section>
      <Text as="h2" variant="title">{COPY.buildYourOwn}</Text>
    </>
  );
};
