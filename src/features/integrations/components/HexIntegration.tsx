/** Hex's transcription models in Capabilities while on, and every Hex meeting synced one-way into Kasset. */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, CardRow, Icon, Status } from '@shared/ui';
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
        title="Hex app"
        status={hex.running && <Status tone="success">Running</Status>}
        actions={!hex.running && <Button variant="outline" size="sm" onClick={hex.openHex}>Open Hex</Button>}
      />
      <CardRow title="New meetings" status={<Status tone={events.tone}>{events.label}</Status>} />
      <CardRow
        title="Meetings"
        description={hex.syncError ?? 'Imported from Hex. Deleting in Hex keeps Kasset’s copy.'}
        actions={
          <Button variant="outline" size="sm" onClick={hex.syncNow} loading={hex.syncing}>
            {!hex.syncing && <Icon icon={RefreshCw} size="xs" />}
            {hex.syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        }
      />
    </IntegrationRow>
  );
};
