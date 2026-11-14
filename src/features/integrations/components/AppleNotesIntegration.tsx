/**
 * AppleNotesIntegration — each meeting saved from now on becomes a note in
 * Apple Notes (folder "Kasset"): summary + transcript, updated on re-save.
 */

import React from 'react';
import { CardRow } from '@shared/ui';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleNotesControls } from '@features/integrations/hooks/useAppleNotesControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleNotes;

export const AppleNotesIntegration: React.FC = () => {
  const notes = useAppleNotesControls();
  return (
    <IntegrationRow
      {...notes}
      icon={<IntegrationIcon src={COPY.icon} alt="" />}
      title={COPY.title}
      description={COPY.description}
      deniedHint={COPY.deniedHint}
    >
      <CardRow
        title="Folder"
        description={`Notes go to “${COPY.folder}” in your default Notes account. Saving a meeting again updates its note.`}
      />
    </IntegrationRow>
  );
};
