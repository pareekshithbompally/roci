/** Whose names and logos these are, in full: fine print on the page (no card) at the end of About and the top of
 *  Acknowledgements, lined up with the section titles and footers. */

import React from 'react';
import { Section, Text } from '@shared/ui';
import { ACKNOWLEDGEMENTS_COPY, TRADEMARKS } from '@config/acknowledgements.config';

export const TrademarkNotice: React.FC = () => (
  <Section title={ACKNOWLEDGEMENTS_COPY.trademarks} layout="stack">
    <div className="mx-4 flex flex-col gap-2">
      {TRADEMARKS.map((paragraph) => <Text key={paragraph} as="p" variant="caption" tone="muted">{paragraph}</Text>)}
    </div>
  </Section>
);
