/** Settings › Personalization: a list of pages that drills in (usePaneDrill). */

import React from 'react';
import { CardRow, IconTile, Section } from '@shared/ui';
import { SettingsPage, usePaneDrill } from '@features/settings/components/shared';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { PERSONALIZATION_PAGES } from '@features/personalization/pages';

export const PersonalizationPanel: React.FC = () => {
  const drill = usePaneDrill();
  if (drill.view) return drill.view;
  return (
    <SettingsPage onForward={drill.forward} pane="personalization">
      <Section footer={PERSONALIZATION_CONFIG.copy.footer}>
        {PERSONALIZATION_PAGES.map(({ id, label, icon, Status, Page }) => (
          <CardRow
            key={id}
            title={label}
            leading={<IconTile icon={icon} />}
            status={Status && <Status />}
            onOpen={() => drill.open({ title: label, render: (close) => <Page onBack={close} /> })}
          />
        ))}
      </Section>
    </SettingsPage>
  );
};
