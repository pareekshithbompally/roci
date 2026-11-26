/** Hex's transcription models in Default Models while on, and every Hex meeting synced one-way into Roci. */

import React from 'react';
import { CardRow, Status } from '@shared/ui';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useHexControls } from '@features/integrations/hooks/useHexControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';
import type { HexEventsState } from '@services/hex';
import type { StateKind } from '@config/states.config';

const COPY = INTEGRATIONS_CONFIG.hex;

const EVENTS: Record<HexEventsState | 'none', { state: StateKind; label: string }> = {
  live: { state: 'ready', label: 'Arrive as they finish' },
  'labs-off': { state: 'attention', label: 'Turn on Labs › Meeting finished event in Hex' },
  waiting: { state: 'queued', label: 'Waiting for Hex' },
  none: { state: 'queued', label: 'Waiting for Hex' },
};

export const HexIntegration: React.FC = () => {
  const hex = useHexControls();
  const events = EVENTS[hex.events ?? 'none'];

  return (
    <IntegrationRow {...hex} icon={<IntegrationIcon app={COPY.app} logo={COPY.icon} />} title={COPY.title} description={COPY.description}>
      <CardRow
        title={COPY.rows.app}
        status={hex.running && <Status state="ready">{COPY.rows.running}</Status>}
        action={hex.running ? undefined : { label: COPY.rows.open, onPress: hex.openHex }}
      />
      <CardRow title={COPY.rows.newMeetings} status={<Status state={events.state}>{events.label}</Status>} />
      <CardRow
        title={COPY.rows.meetings}
        description={hex.syncError}
        action={{ label: hex.syncing ? COPY.rows.syncing : COPY.rows.sync, onPress: hex.syncNow, busy: hex.syncing }}
      />
    </IntegrationRow>
  );
};
