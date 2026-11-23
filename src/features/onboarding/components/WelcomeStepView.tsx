/** The first step: what Roci does. Run again from Settings, Cancel leaves everything as it was. */

import React from 'react';
import { FeatureList, FeatureRow, WelcomeStep } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { STEP_AFTER_WELCOME, useIsSetupRerun, useResetOnboarding, useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { useIconArt } from '@shared/hooks';

const COPY = ONBOARDING_CONFIG.welcome;

export const WelcomeStepView: React.FC = () => {
  const setStep = useSetOnboardingStep();
  const rerun = useIsSetupRerun();
  const reset = useResetOnboarding();
  const art = useIconArt();
  return (
    <WelcomeStep
      icon={APP_CONFIG.icon}
      title={COPY.heading}
      primary={{ label: ONBOARDING_CONFIG.actions.continue, onClick: () => setStep(STEP_AFTER_WELCOME) }}
      secondary={rerun ? { label: ONBOARDING_CONFIG.actions.cancel, onClick: reset } : undefined}
    >
      <FeatureList>
        {COPY.features.map(({ art: name, title, detail }) => <FeatureRow key={title} image={art(name)} title={title}>{detail}</FeatureRow>)}
      </FeatureList>
    </WelcomeStep>
  );
};
