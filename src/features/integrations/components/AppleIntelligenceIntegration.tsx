/**
 * AppleIntelligenceIntegration — Apple's on-device models. On: Apple
 * Intelligence joins Settings › Capabilities › Summaries, and Apple Speech joins
 * Speech recognition (its permission and model download are set up there).
 * Off: both disappear.
 */

import React from 'react';
import { CardRow } from '@shared/ui';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleIntelligenceControls } from '@features/integrations/hooks/useAppleIntelligenceControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleIntelligence;

export const AppleIntelligenceIntegration: React.FC = () => {
  const apple = useAppleIntelligenceControls();

  return (
    <IntegrationRow
      {...apple}
      icon={<IntegrationIcon src={COPY.icon} alt="" />}
      title={COPY.title}
      description={COPY.description}
      deniedHint={COPY.deniedHint}
    >
      <CardRow
        title="Summaries"
        description={`Choose Apple Intelligence in Settings › Capabilities › Summaries. ${apple.contextTokens.toLocaleString()}-token context: long meetings are summarized from an excerpt.`}
      />
      <CardRow
        title="Speech recognition"
        description="Choose Apple Speech in Settings › Capabilities › Speech recognition. Allow and download it there."
      />
    </IntegrationRow>
  );
};
