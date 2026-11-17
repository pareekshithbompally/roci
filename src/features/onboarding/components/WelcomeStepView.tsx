/** First-run step on a device that doesn't record: what Roci does, then on to choosing the AI. */

import React from 'react';
import { FeatureRow, WelcomeStep } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

const COPY = ONBOARDING_CONFIG.welcome;

export const WelcomeStepView: React.FC = () => {
  const setStep = useSetOnboardingStep();
  return (
    <WelcomeStep icon={APP_CONFIG.icon} title={COPY.heading} primary={{ label: ONBOARDING_CONFIG.actions.continue, onClick: () => setStep('setup') }}>
      <div className="flex flex-col gap-6">
        {COPY.features.map(({ icon, title, detail }) => <FeatureRow key={title} icon={icon} title={title}>{detail}</FeatureRow>)}
      </div>
    </WelcomeStep>
  );
};
