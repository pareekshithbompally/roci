/** Settings › General › Acknowledgements: the open-source software Roci uses, by group, each with its licence; a licence
 *  opens its full text one level deeper (usePaneDrill). */

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { openUrl } from '@services/tauri';
import { CardRow, IconButton, Section, Text } from '@shared/ui';
import {
  ACKNOWLEDGEMENTS,
  ACKNOWLEDGEMENTS_COPY as COPY,
  LICENSE_TEXT_IDS,
  TRADEMARK_NOTICE,
  type Acknowledgement,
  type LicenseTextId,
} from '@config/acknowledgements.config';
import mitText from '@config/licenses/MIT.txt?raw';
import apacheText from '@config/licenses/Apache-2.0.txt?raw';
import bsd3Text from '@config/licenses/BSD-3-Clause.txt?raw';
import iscText from '@config/licenses/ISC.txt?raw';
import { SettingsPage, usePaneDrill } from './shared';

const LICENSE_TEXTS: Record<LicenseTextId, string> = {
  MIT: mitText,
  'Apache-2.0': apacheText,
  'BSD-3-Clause': bsd3Text,
  ISC: iscText,
};

/** Copyright line and any attribution the licence asks to be reproduced. */
const Attribution: React.FC<{ item: Acknowledgement }> = ({ item }) => (
  <>
    {item.copyright}
    {item.copyright && item.notice && <br />}
    {item.notice}
  </>
);

const AcknowledgementRow: React.FC<{ item: Acknowledgement }> = ({ item }) => (
  <CardRow
    title={item.name}
    description={item.copyright || item.notice ? <Attribution item={item} /> : undefined}
    align="start"
    wrap
    status={<Text variant="helper" tone="muted">{item.license}</Text>}
    actions={<IconButton icon={ExternalLink} label={COPY.open(item.name)} size="sm" onClick={() => void openUrl(item.url)} />}
  />
);

/** One licence's full text. */
const LicencePage: React.FC<{ id: LicenseTextId; onBack: () => void }> = ({ id, onBack }) => (
  <SettingsPage title={id} onBack={onBack}>
    <Section>
      <Text as="p" variant="mono" tone="muted" className="whitespace-pre-wrap p-4">{LICENSE_TEXTS[id]}</Text>
    </Section>
  </SettingsPage>
);

export const AcknowledgementsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const drill = usePaneDrill();
  if (drill.view) return drill.view;
  return (
    <SettingsPage title={COPY.title} onBack={onBack} onForward={drill.forward}>
      {ACKNOWLEDGEMENTS.map((group) => (
        <Section key={group.title} title={group.title} footer={group.description}>
          {group.items.map((item) => <AcknowledgementRow key={item.name} item={item} />)}
        </Section>
      ))}
      <Section title={COPY.licences} footer={TRADEMARK_NOTICE}>
        {LICENSE_TEXT_IDS.map((id) => (
          <CardRow key={id} title={id} onOpen={() => drill.open({ title: id, render: (close) => <LicencePage id={id} onBack={close} /> })} />
        ))}
      </Section>
    </SettingsPage>
  );
};
