/**
 * AppleNotesIntegration — each meeting saved from now on becomes a note in
 * Apple Notes (folder "Kasset"): summary + transcript, updated on re-save.
 */

import React from 'react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleNotesControls } from '@features/integrations/hooks/useAppleNotesControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleNotes;

export const AppleNotesIntegration: React.FC = () => (
  <IntegrationRow
    {...useAppleNotesControls()}
    icon={<IntegrationIcon src={COPY.icon} alt="" />}
    title={COPY.title}
    description={COPY.description}
    deniedHint={COPY.deniedHint}
  />
);
