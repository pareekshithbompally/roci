/**
 * AppleIntelligenceIntegration — Apple's on-device models. On: Apple
 * Intelligence joins Settings › Capabilities › Summaries, and Apple Speech joins
 * Speech recognition (its permission and model download are set up there).
 * Off: both disappear.
 */

import React from 'react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleIntelligenceControls } from '@features/integrations/hooks/useAppleIntelligenceControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleIntelligence;

export const AppleIntelligenceIntegration: React.FC = () => (
  <IntegrationRow
    {...useAppleIntelligenceControls()}
    icon={<IntegrationIcon src={COPY.icon} alt="" />}
    title={COPY.title}
    description={COPY.description}
    deniedHint={COPY.deniedHint}
  />
);
