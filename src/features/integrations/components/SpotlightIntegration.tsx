/** Meetings appear in macOS Spotlight (title, attendees, summary, notes, to-dos); transcripts stay in Roci. */

import React from 'react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useSpotlightControls } from '@features/integrations/hooks/useSpotlightControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.spotlight;

export const SpotlightIntegration: React.FC = () => (
  <IntegrationRow
    {...useSpotlightControls()}
    icon={<IntegrationIcon app={COPY.app} symbol={COPY.symbol} />}
    title={COPY.title}
    description={COPY.description}
  />
);
