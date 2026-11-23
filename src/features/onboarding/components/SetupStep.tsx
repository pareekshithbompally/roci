/** First-run: the AI Roci uses. Each option opens its own step (Apple Intelligence, models on this device, a local server,
 *  an online provider's key); onboarding ends only when one of them finishes, or on Set up later. */

import React from 'react';
import { CardRow, Section, WelcomeStep } from '@shared/ui';
import { useAppleIntelligenceControls } from '@features/integrations';
import type { IntegrationAccess } from '@features/integrations';
import { platform } from '@platform/index';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { ONBOARDING_CONFIG, ONBOARDING_ICONS } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useOnboardingBack, useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { OnboardingIcon } from './OnboardingIcon';

const COPY = ONBOARDING_CONFIG.setup;
const APPLE = INTEGRATIONS_CONFIG.appleIntelligence;

/** The row's line: its state while it isn't ready, else what it needs. */
function appleDetail(access: IntegrationAccess, reason?: string): string {
  if (access === 'unknown') return COPY.checking;
  if (access === 'needs-settings') return APPLE.onboarding.needsSettings;
  if (access === 'unavailable') return reason ?? COPY.appleDetail;
  return COPY.appleDetail;
}

const AppleRow: React.FC = () => {
  const { access, unavailableReason } = useAppleIntelligenceControls();
  const setStep = useSetOnboardingStep();
  return (
    <CardRow
      leading={<OnboardingIcon source={ONBOARDING_ICONS.appleIntelligence} />}
      title={APPLE.title}
      description={appleDetail(access, unavailableReason)}
      onOpen={() => setStep('apple')}
    />
  );
};

export const SetupStep: React.FC = () => {
  const setStep = useSetOnboardingStep();
  const back = useOnboardingBack();
  const finish = useFinishOnboarding();

  return (
    <WelcomeStep title={COPY.heading} secondary={{ label: ONBOARDING_CONFIG.actions.later, onClick: finish }} onBack={back}>
      <Section footer={COPY.footer}>
        {platform.hasAppleIntelligence && <AppleRow />}
        {platform.hasLocalModels && (
          <CardRow
            leading={<OnboardingIcon source={ONBOARDING_ICONS.onDevice} />}
            title={COPY.onDevice.title}
            description={COPY.onDevice.description}
            onOpen={() => setStep('onDevice')}
          />
        )}
        <CardRow
          leading={<OnboardingIcon source={ONBOARDING_ICONS.local} />}
          title={COPY.local.title}
          description={COPY.local.description}
          onOpen={() => setStep('local')}
        />
        <CardRow
          leading={<OnboardingIcon source={ONBOARDING_ICONS.remote} />}
          title={COPY.remote.title}
          description={COPY.remote.description}
          onOpen={() => setStep('providers')}
        />
      </Section>
    </WelcomeStep>
  );
};
