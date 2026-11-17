/** The first-run flow: one frame whose content changes per step (welcome or permissions, AI setup, local server). */

import React from 'react';
import { WelcomeFrame } from '@shared/ui';
import { useOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { WelcomeStepView } from './WelcomeStepView';
import { PermissionsStep } from './PermissionsStep';
import { SetupStep } from './SetupStep';
import { LocalSetup } from './LocalSetup';

const STEPS = {
  welcome: WelcomeStepView,
  permissions: PermissionsStep,
  setup: SetupStep,
  local: LocalSetup,
} as const;

export const OnboardingView: React.FC = () => {
  const step = useOnboardingStep();
  const Step = STEPS[step];
  return (
    <WelcomeFrame stepKey={step}>
      <Step />
    </WelcomeFrame>
  );
};
