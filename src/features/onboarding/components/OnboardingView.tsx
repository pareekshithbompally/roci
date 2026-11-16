/** The first-run window: one panel, pinned at the top, whose content fades between steps (permissions, AI setup, local server). */

import React from 'react';
import { Surface, TitlebarDragRegion } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';
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
    <Surface
      as="main"
      variant="page"
      className="relative flex h-screen justify-center overflow-y-auto px-6 pb-6"
      style={{ paddingTop: UI_CONFIG.layout.onboardingPanelTop }}
    >
      <TitlebarDragRegion />
      {/* The panel stays put across steps; only its content changes, with a fade and no movement. */}
      <Surface variant="card" radius="xl" edge="all" className="h-fit w-full max-w-lg p-8 animate-sheet-show">
        <div key={step} className="animate-fade-in">
          <Step />
        </div>
      </Surface>
    </Surface>
  );
};
