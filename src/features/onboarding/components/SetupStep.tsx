/** First-run: the AI Roci uses. Each option opens its own step (Apple Intelligence, an online provider's key, a local
 *  server); onboarding ends only when one of them finishes, or on Set up later. */

import React from 'react';
import { CardRow, Section, WelcomeStep } from '@shared/ui';
import { useAppleIntelligenceControls } from '@features/integrations';
import type { IntegrationAccess } from '@features/integrations';
import { platform } from '@platform/index';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { ONBOARDING_CONFIG, ONBOARDING_ICONS } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
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
  const finish = useFinishOnboarding();

  return (
    <WelcomeStep title={COPY.heading} secondary={{ label: ONBOARDING_CONFIG.actions.later, onClick: finish }}>
      <Section footer={COPY.footer}>
        {platform.hasAppleIntelligence && <AppleRow />}
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
