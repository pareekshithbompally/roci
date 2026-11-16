/** Apple's on-device models: on adds Apple Intelligence to Chat and Summaries and Apple Speech to Speech recognition. */

import React from 'react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleIntelligenceControls } from '@features/integrations/hooks/useAppleIntelligenceControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleIntelligence;

export const AppleIntelligenceIntegration: React.FC = () => (
  <IntegrationRow
    {...useAppleIntelligenceControls()}
    icon={<IntegrationIcon src={COPY.icon} />}
    title={COPY.title}
    description={COPY.description}
    deniedHint={COPY.deniedHint}
  />
);
