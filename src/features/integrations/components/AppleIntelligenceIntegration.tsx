/**
 * AppleIntelligenceIntegration — Apple's on-device models. On: Apple
 * Intelligence joins Settings › Audio › Summary Model, and Apple Speech joins
 * Transcription Model. Off: both disappear.
 */

import React from 'react';
import { Check, Download, Loader2 } from 'lucide-react';
import { Button, CardRow, Icon, Text } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useAppleIntelligenceControls } from '@features/integrations/hooks/useAppleIntelligenceControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.appleIntelligence;

export const AppleIntelligenceIntegration: React.FC = () => {
  const apple = useAppleIntelligenceControls();
  const { speech } = apple;

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
        description={`Choose Apple Intelligence in Settings › Audio › Summary Model. ${apple.contextTokens.toLocaleString()}-token context: long meetings are summarized from an excerpt.`}
      />
      {speech && (
        <>
          <CardRow
            title="Speech Recognition"
            description={speech.access === 'needs-settings' ? COPY.speechDeniedHint : 'Lets Apple Speech transcribe your recordings on this Mac.'}
            actions={<PermissionAction state={speech.access} onRequest={speech.request} onOpenSettings={speech.openSettings} />}
          />
          <CardRow
            title="English speech model"
            description="Downloaded once by macOS; shared with other apps."
            actions={speech.installed ? (
              <span className="inline-flex items-center gap-1">
                <Icon icon={Check} size="sm" tone="success" />
                <Text variant="helper" tone="success">Installed</Text>
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={speech.download} disabled={speech.downloading}>
                <Icon icon={speech.downloading ? Loader2 : Download} size="xs" className={speech.downloading ? 'animate-spin' : undefined} />
                {speech.downloading ? 'Downloading…' : 'Download'}
              </Button>
            )}
          />
        </>
      )}
    </IntegrationRow>
  );
};
