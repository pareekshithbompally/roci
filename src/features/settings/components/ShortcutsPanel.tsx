/** Settings › Shortcuts: the keys Roci answers to, read from the shortcut registry (view only for now). */

import React from 'react';
import { CardRow, IconTile, Keycaps, Section } from '@shared/ui';
import { platform } from '@platform/index';
import { APP_SHORTCUTS, GLOBAL_SHORTCUTS, type ShortcutDefinition } from '@config/shortcuts.config';
import { acceleratorKeys } from '@features/shortcuts';
import { SettingsPage } from './shared';
import { SHORTCUTS_COPY } from '@config/settingsCopy.config';

const COPY = SHORTCUTS_COPY;

const ShortcutRows: React.FC<{ shortcuts: Record<string, ShortcutDefinition> }> = ({ shortcuts }) => (
  <>
    {Object.entries(shortcuts).map(([id, { accelerator, description, icon }]) => (
      <CardRow key={id} leading={<IconTile icon={icon} />} title={description} actions={<Keycaps keys={acceleratorKeys(accelerator)} variant="field" />} />
    ))}
  </>
);

export const ShortcutsPanel: React.FC = () => (
  <SettingsPage pane="shortcuts">
    <Section title={COPY.inApp} footer={COPY.inAppFooter}>
      <ShortcutRows shortcuts={APP_SHORTCUTS} />
    </Section>
    {platform.hasGlobalShortcuts && (
      <Section title={COPY.global} footer={COPY.globalFooter}>
        <ShortcutRows shortcuts={GLOBAL_SHORTCUTS} />
      </Section>
    )}
  </SettingsPage>
);
