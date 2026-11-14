/**
 * HexIntegration — Hex's transcription models (in Settings › Audio while on)
 * and every Hex meeting kept in Kasset (one-way, Hex → Kasset).
 */

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
    <IntegrationRow {...hex} icon={<IntegrationIcon src={COPY.icon} alt="" />} title={COPY.title} description={COPY.description}>
      <CardRow
        title="Hex app"
        actions={hex.running
          ? <Status tone="success">Running</Status>
          : <Button variant="outline" size="sm" onClick={hex.openHex}>Open Hex</Button>}
      />
      <CardRow title="New meetings" actions={<Status tone={events.tone}>{events.label}</Status>} />
      <CardRow
        title="Meetings"
        description={hex.syncError ?? 'Imported from Hex. Deleting in Hex keeps Kasset’s copy.'}
        actions={
          <Button variant="outline" size="sm" onClick={hex.syncNow} disabled={hex.syncing}>
            <Icon icon={RefreshCw} size="xs" className={hex.syncing ? 'animate-spin' : undefined} />
            {hex.syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        }
      />
    </IntegrationRow>
  );
};
