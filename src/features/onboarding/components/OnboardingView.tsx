/** The first-run flow: one frame whose content changes per step (welcome, permissions on the Mac, AI setup and its options). */

import React from 'react';
import { WelcomeFrame } from '@shared/ui';
import { useOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { WelcomeStepView } from './WelcomeStepView';
import { PermissionsStep } from './PermissionsStep';
import { SetupStep } from './SetupStep';
import { LocalSetup } from './LocalSetup';
import { OnDeviceSetup } from './OnDeviceSetup';
import { AppleStep } from './AppleStep';
import { ProvidersStep } from './ProvidersStep';
import { ProviderKeyStep } from './ProviderKeyStep';

const STEPS = {
  welcome: WelcomeStepView,
  permissions: PermissionsStep,
  setup: SetupStep,
  apple: AppleStep,
  providers: ProvidersStep,
  provider: ProviderKeyStep,
  local: LocalSetup,
  onDevice: OnDeviceSetup,
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
