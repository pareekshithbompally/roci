/** Settings › About: Roci and its version (header), updates, the open-source software it uses, and first-run setup. */

import React from 'react';
import { Github } from 'lucide-react';
import { Button, CardRow, IconButton, Section, Text } from '@shared/ui';
import { openUrl } from '@services/tauri';
import { APP_CONFIG } from '@config/app.config';
import { useRunSetupAgain } from '@features/onboarding/stores/onboardingStore';
import { platform } from '@platform/index';
import { ACKNOWLEDGEMENTS_COPY } from '@config/acknowledgements.config';
import { useSystemInfo } from '@features/settings/hooks/useSystemInfo';
import { useAppUpdate } from '@features/settings/hooks/useAppUpdate';
import { AcknowledgementsPage } from './AcknowledgementsPage';
import { SettingsPage, usePaneDrill } from './shared';
import { ABOUT_COPY } from '@config/settingsCopy.config';

const COPY = ABOUT_COPY;

/** The version number and Check for Updates; the result is a toast. */
const VersionStatus: React.FC<{ appVersion: string; checking: boolean; onCheck: () => void }> = ({ appVersion, checking, onCheck }) => (
  <>
    <Text variant="figure" tone="muted">{appVersion || '…'}</Text>
    {platform.hasUpdater && (
      <Button variant="outline" size="sm" onClick={onCheck} loading={checking}>{COPY.checkForUpdates}</Button>
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
  const runSetupAgain = useRunSetupAgain();
  const appUpdate = useAppUpdate();
  const { appVersion } = useSystemInfo();
  const drill = usePaneDrill();
  if (drill.view) return drill.view;
  return (
    <SettingsPage pane="about" hero={{ caption: appVersion ? COPY.versionNumber(appVersion) : undefined, footer: <Credit /> }} onForward={drill.forward}>
      <Section footer={COPY.setupFooter}>
        <CardRow title={COPY.version} actions={<VersionStatus appVersion={appVersion} checking={appUpdate.checking} onCheck={() => void appUpdate.checkNow()} />} />
        <CardRow
          title={ACKNOWLEDGEMENTS_COPY.title}
          onOpen={() => drill.open({ title: ACKNOWLEDGEMENTS_COPY.title, render: (close) => <AcknowledgementsPage onBack={close} /> })}
        />
        <CardRow title={COPY.runSetupAgain} tone="accent" onPress={runSetupAgain} />
      </Section>
    </SettingsPage>
  );
};
