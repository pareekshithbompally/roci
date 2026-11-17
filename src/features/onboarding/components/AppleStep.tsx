/** First-run: Apple Intelligence on its own step — its state, and Use (ready), Open Settings (off, where a pane can be
 *  opened) or the reason it can't run. Back returns to the choice; onboarding ends only on Use. */

import React from 'react';
import { WelcomeStep } from '@shared/ui';
import type { WelcomeAction } from '@shared/ui';
import { useAppleIntelligenceControls, useAppleIntelligenceSetup } from '@features/integrations';
import type { IntegrationAccess } from '@features/integrations';
import { platform } from '@platform/index';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

const COPY = ONBOARDING_CONFIG.setup;
const APPLE = INTEGRATIONS_CONFIG.appleIntelligence;

/** Its state, in one sentence under the title. */
function footerFor(access: IntegrationAccess, reason?: string): string | undefined {
  if (access === 'unknown') return COPY.checking;
  if (access === 'needs-settings') return COPY.apple.needsSettings;
  if (access === 'unavailable') return reason;
  return COPY.apple.ready;
}

export const AppleStep: React.FC = () => {
  const { access, openSettings, unavailableReason } = useAppleIntelligenceControls();
  const setup = useAppleIntelligenceSetup();
  const finish = useFinishOnboarding();
  const setStep = useSetOnboardingStep();

  const use = () => {
    setup?.setUp();
    finish();
  };
  const primary: WelcomeAction = access === 'needs-settings' && platform.canOpenSettingsPanes
    ? { label: ONBOARDING_CONFIG.actions.openSettings, onClick: openSettings }
    : { label: COPY.apple.use, onClick: use, disabled: access !== 'ready' };

  return (
    <WelcomeStep
      icon={APPLE.icon}
      title={APPLE.title}
      subtitle={footerFor(access, unavailableReason)}
      primary={primary}
      secondary={{ label: ONBOARDING_CONFIG.actions.back, onClick: () => setStep('setup') }}
    />
  );
};
