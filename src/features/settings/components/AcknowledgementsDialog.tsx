import React from 'react';
import { ExternalLink } from 'lucide-react';
import { openUrl } from '@services/tauri';
import { CardRow, Disclosure, IconButton, Section, Text } from '@shared/ui';
import { ACKNOWLEDGEMENTS, LICENSE_TEXT_IDS, TRADEMARK_NOTICE, type Acknowledgement, type LicenseTextId } from '@config/acknowledgements.config';
import mitText from '@config/licenses/MIT.txt?raw';
import apacheText from '@config/licenses/Apache-2.0.txt?raw';
import bsd3Text from '@config/licenses/BSD-3-Clause.txt?raw';
import iscText from '@config/licenses/ISC.txt?raw';
import { FormDialog } from './shared';

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
    status={<Text variant="helper" tone="muted">{item.license}</Text>}
    actions={<IconButton icon={ExternalLink} label={`Open ${item.name}`} size="sm" onClick={() => void openUrl(item.url)} />}
  />
);

interface AcknowledgementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Settings › General › Acknowledgements: every open-source project Roci uses, with its licence text. */
export const AcknowledgementsDialog: React.FC<AcknowledgementsDialogProps> = ({ open: isOpen, onOpenChange }) => (
  <FormDialog open={isOpen} onOpenChange={onOpenChange} title="Acknowledgements" size="xl">
    <div className="flex flex-col gap-6">
      <Text as="p" variant="helper" tone="muted" className="mx-4">
        Roci is built with the following open-source software.
      </Text>
      {ACKNOWLEDGEMENTS.map((group) => (
        <Section key={group.title} title={group.title}>
          {group.items.map((item) => <AcknowledgementRow key={item.name} item={item} />)}
        </Section>
      ))}
      <Section title="Licence texts">
        {LICENSE_TEXT_IDS.map((id) => (
          <Disclosure key={id} summary={<Text variant="bodyStrong">{id}</Text>}>
            <Text as="p" variant="mono" tone="muted" className="whitespace-pre-wrap px-4 pb-4">{LICENSE_TEXTS[id]}</Text>
          </Disclosure>
        ))}
      </Section>
      <Text as="p" variant="helper" tone="muted" className="mx-4">{TRADEMARK_NOTICE}</Text>
    </div>
  </FormDialog>
);
