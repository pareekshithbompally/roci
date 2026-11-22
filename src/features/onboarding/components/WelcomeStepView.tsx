/** First-run step on a device that doesn't record: what Roci does, then on to choosing the AI. */

import React from 'react';
import { FeatureList, FeatureRow, WelcomeStep } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { useIconArt } from '@shared/hooks';

const COPY = ONBOARDING_CONFIG.welcome;

export const WelcomeStepView: React.FC = () => {
  const setStep = useSetOnboardingStep();
  const art = useIconArt();
  return (
    <WelcomeStep icon={APP_CONFIG.icon} title={COPY.heading} primary={{ label: ONBOARDING_CONFIG.actions.continue, onClick: () => setStep('setup') }}>
      <FeatureList>
        {COPY.features.map(({ art: name, title, detail }) => <FeatureRow key={title} image={art(name)} title={title}>{detail}</FeatureRow>)}
      </FeatureList>
    </WelcomeStep>
  );
};
