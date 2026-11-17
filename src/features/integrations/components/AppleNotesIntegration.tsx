/** Each meeting saved from now on becomes a note in Apple Notes (folder "Roci"), updated on re-save. */

import React from 'react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleNotesControls } from '@features/integrations/hooks/useAppleNotesControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleNotes;

export const AppleNotesIntegration: React.FC = () => (
  <IntegrationRow
    {...useAppleNotesControls()}
    icon={<IntegrationIcon app={COPY.app} symbol={COPY.symbol} />}
    title={COPY.title}
    description={COPY.description}
    deniedHint={COPY.deniedHint}
  />
);
