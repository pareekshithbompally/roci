/** Settings › About: Roci and its version (header), updates, the open-source software it uses, and first-run setup. */

import React from 'react';
import { Github } from 'lucide-react';
import { Button, CardRow, IconButton, Section, Text } from '@shared/ui';
import { openUrl } from '@services/tauri';
import { APP_CONFIG } from '@config/app.config';
import { useSettings } from '@shared/contexts/SettingsContext';
import { platform } from '@platform/index';
import { ACKNOWLEDGEMENTS_COPY } from '@config/acknowledgements.config';
import { useSystemInfo } from '@features/settings/hooks/useSystemInfo';
import { useAppUpdate } from '@features/settings/hooks/useAppUpdate';
import { AcknowledgementsPage } from './AcknowledgementsPage';
import { SettingsPage, usePaneDrill } from './shared';

const COPY = {
  version: (version: string) => `Version ${version}`,
  github: 'Roci on GitHub',
  setupFooter: 'Run Setup Again shows the first-run steps, including choosing your AI.',
} as const;

/** The version number and Check for Updates; the result is a toast. */
const VersionStatus: React.FC<{ appVersion: string; checking: boolean; onCheck: () => void }> = ({ appVersion, checking, onCheck }) => (
  <>
    <Text variant="figure" tone="muted">{appVersion || '…'}</Text>
    {platform.hasUpdater && (
      <Button variant="outline" size="sm" onClick={onCheck} loading={checking}>Check for Updates</Button>
    )}
  </>
);

/** Under the header: Roci on GitHub, and the copyright as the app bundle states it. */
const Credit: React.FC = () => (
  <>
    <IconButton icon={Github} label={COPY.github} size="sm" onClick={() => void openUrl(APP_CONFIG.repositoryUrl)} />
    <Text variant="caption" tone="muted">{APP_CONFIG.copyright}</Text>
  </>
);

export const AboutPanel: React.FC = () => {
  const { setSettings } = useSettings();
  const appUpdate = useAppUpdate();
  const { appVersion } = useSystemInfo();
  const drill = usePaneDrill();
  if (drill.view) return drill.view;
  return (
    <SettingsPage pane="about" hero={{ caption: appVersion ? COPY.version(appVersion) : undefined, footer: <Credit /> }} onForward={drill.forward}>
      <Section footer={COPY.setupFooter}>
        <CardRow title="Version" actions={<VersionStatus appVersion={appVersion} checking={appUpdate.checking} onCheck={() => void appUpdate.checkNow()} />} />
        <CardRow
          title={ACKNOWLEDGEMENTS_COPY.title}
          onOpen={() => drill.open({ title: ACKNOWLEDGEMENTS_COPY.title, render: (close) => <AcknowledgementsPage onBack={close} /> })}
        />
        <CardRow title="Run Setup Again" tone="accent" onPress={() => setSettings({ onboarding: { completed: false } })} />
      </Section>
    </SettingsPage>
  );
};
