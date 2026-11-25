/** Settings › General › Acknowledgements: the trademark notice, then the open-source software Roci uses, by group. A row is
 *  the name and its licence (Apple's Legal pages); it opens the copyright, the licence's full text and the website one level
 *  deeper (usePaneDrill). */

import React from 'react';
import { openUrl } from '@services/tauri';
import { CardRow, Section, Text } from '@shared/ui';
import {
  ACKNOWLEDGEMENTS,
  ACKNOWLEDGEMENTS_COPY as COPY,
  type Acknowledgement,
  type LicenseTextId,
} from '@config/acknowledgements.config';
import mitText from '@config/licenses/MIT.txt?raw';
import apacheText from '@config/licenses/Apache-2.0.txt?raw';
import bsd3Text from '@config/licenses/BSD-3-Clause.txt?raw';
import iscText from '@config/licenses/ISC.txt?raw';
import { SettingsPage, usePaneDrill, type DrillPage } from './shared';
import { TrademarkNotice } from './TrademarkNotice';

const LICENSE_TEXTS: Record<LicenseTextId, string> = {
  MIT: mitText,
  'Apache-2.0': apacheText,
  'BSD-3-Clause': bsd3Text,
  ISC: iscText,
};

/** A block of text in its own card: the trademark notice, a copyright. */
const Paragraph: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <Section title={title}>
    <Text as="p" variant="body" className="whitespace-pre-wrap p-4">{children}</Text>
  </Section>
);

/** One project: its copyright and any notice its licence asks to be reproduced, the licence's text, and its website. */
const AcknowledgementDetail: React.FC<{ item: Acknowledgement; onBack: () => void }> = ({ item, onBack }) => (
  <SettingsPage title={item.name} onBack={onBack}>
    {(item.copyright || item.notice) && <Paragraph>{[item.copyright, item.notice].filter(Boolean).join('\n')}</Paragraph>}
    <Section title={COPY.licence}>
      {item.text
        ? <Text as="p" variant="mono" tone="muted" className="whitespace-pre-wrap p-4">{LICENSE_TEXTS[item.text]}</Text>
        : <CardRow title={item.license} />}
    </Section>
    <Section>
      <CardRow title={COPY.openWebsite} tone="accent" onPress={() => void openUrl(item.url)} />
    </Section>
  </SettingsPage>
);

const detailPage = (item: Acknowledgement): DrillPage => ({
  title: item.name,
  render: (close) => <AcknowledgementDetail item={item} onBack={close} />,
});

export const AcknowledgementsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const drill = usePaneDrill();
  if (drill.view) return drill.view;
  return (
    <SettingsPage title={COPY.title} onBack={onBack} onForward={drill.forward}>
      <TrademarkNotice />
      {ACKNOWLEDGEMENTS.map((group) => (
        <Section key={group.title} title={group.title} footer={group.description}>
          {group.items.map((item) => (
            <CardRow key={item.name} title={item.name} description={item.license} onOpen={() => drill.open(detailPage(item))} />
          ))}
        </Section>
      ))}
    </SettingsPage>
  );
};
