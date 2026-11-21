/** Settings › Personalization: a list of pages that drills in — on Mac and iPad the page replaces the list in the pane
 *  (back chevron in its header); on iPhone it is pushed onto the Settings navigation stack. */

import React, { useState } from 'react';
import { CardRow, IconTile, Section, useNavStack } from '@shared/ui';
import { SettingsPage } from '@features/settings/components/shared';
import { useFormFactor } from '@platform/formFactor';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { PERSONALIZATION_PAGES, type PersonalizationPage } from '@features/personalization/pages';

interface PageListProps {
  onOpen: (page: PersonalizationPage) => void;
  /** Back into the page last left (Mac, iPad). */
  onForward?: () => void;
}

const PageList: React.FC<PageListProps> = ({ onOpen, onForward }) => (
  <SettingsPage title={PERSONALIZATION_CONFIG.copy.title} onForward={onForward} pane="personalization">
    <Section footer={PERSONALIZATION_CONFIG.copy.footer}>
      {PERSONALIZATION_PAGES.map((page) => (
        <CardRow
          key={page.id}
          title={page.label}
          leading={<IconTile icon={page.icon} />}
          status={page.Status && <page.Status />}
          onOpen={() => onOpen(page)}
        />
      ))}
    </Section>
  </SettingsPage>
);

const PhonePanel: React.FC = () => {
  const { push } = useNavStack();
  return <PageList onOpen={({ label, Page }) => push({ title: label, content: <Page /> })} />;
};

/** Mac and iPad: the open page, and the one last left with back (› returns to it until another page opens). */
const PanePanel: React.FC = () => {
  const [{ open, left }, setPages] = useState<{ open: PersonalizationPage | null; left: PersonalizationPage | null }>({ open: null, left: null });
  if (open) return <open.Page onBack={() => setPages({ open: null, left: open })} />;
  return (
    <PageList
      onOpen={(page) => setPages({ open: page, left: null })}
      onForward={left ? () => setPages({ open: left, left: null }) : undefined}
    />
  );
};

export const PersonalizationPanel: React.FC = () => (useFormFactor() === 'phone' ? <PhonePanel /> : <PanePanel />);
