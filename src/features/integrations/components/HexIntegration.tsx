/** Hex's transcription models in Default Models while on, and every Hex meeting synced one-way into Roci. */

import React from 'react';
import { CardRow, Status } from '@shared/ui';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useHexControls } from '@features/integrations/hooks/useHexControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';
import type { HexEventsState } from '@services/hex';

const COPY = INTEGRATIONS_CONFIG.hex;

const EVENTS: Record<HexEventsState | 'none', { tone: 'success' | 'warning' | 'muted'; label: string }> = {
  live: { tone: 'success', label: 'Arrive as they finish' },
  'labs-off': { tone: 'warning', label: 'Turn on Labs › Meeting finished event in Hex' },
  waiting: { tone: 'muted', label: 'Waiting for Hex' },
  none: { tone: 'muted', label: 'Waiting for Hex' },
};

export const HexIntegration: React.FC = () => {
  const hex = useHexControls();
  const events = EVENTS[hex.events ?? 'none'];

  return (
    <IntegrationRow {...hex} icon={<IntegrationIcon app={COPY.app} src={COPY.icon} />} title={COPY.title} description={COPY.description}>
      <CardRow
        title={COPY.rows.app}
        status={hex.running && <Status tone="success">{COPY.rows.running}</Status>}
        action={hex.running ? undefined : { label: COPY.rows.open, onPress: hex.openHex }}
      />
      <CardRow title={COPY.rows.newMeetings} status={<Status tone={events.tone}>{events.label}</Status>} />
      <CardRow
        title={COPY.rows.meetings}
        description={hex.syncError}
        action={{ label: hex.syncing ? COPY.rows.syncing : COPY.rows.sync, onPress: hex.syncNow, busy: hex.syncing }}
      />
    </IntegrationRow>
  );
};
