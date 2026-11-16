/** The first-run window: one centred panel per step (permissions, AI setup, local server), in place of the app. */

import React from 'react';
import { Surface, TitlebarDragRegion } from '@shared/ui';
import { useOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { PermissionsStep } from './PermissionsStep';
import { SetupStep } from './SetupStep';
import { LocalSetup } from './LocalSetup';

const STEPS = {
  permissions: PermissionsStep,
  setup: SetupStep,
  local: LocalSetup,
} as const;

export const OnboardingView: React.FC = () => {
  const step = useOnboardingStep();
  const Step = STEPS[step];
  return (
    <Surface as="main" variant="page" className="relative flex h-screen items-center justify-center overflow-y-auto p-6">
      <TitlebarDragRegion />
      {/* Keyed by step, so each step enters with the shared sheet motion. */}
      <Surface key={step} variant="card" radius="xl" edge="all" className="w-full max-w-lg p-8 animate-sheet-show">
        <Step />
      </Surface>
    </Surface>
  );
};
