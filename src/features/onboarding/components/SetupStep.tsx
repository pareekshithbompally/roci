/** First-run step: the AI Roci uses. Apple Intelligence on this device, a local server, an online provider, or later. */

import React from 'react';
import { CardRow, Section, WelcomeStep } from '@shared/ui';
import { useAppleIntelligenceControls, useAppleIntelligenceSetup } from '@features/integrations';
import { useOpenAISetup } from '@features/settings';
import type { IntegrationAccess } from '@features/integrations';
import { platform } from '@platform/index';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { ONBOARDING_CONFIG, ONBOARDING_ICONS } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { OnboardingIcon } from './OnboardingIcon';

const COPY = ONBOARDING_CONFIG.setup;
const APPLE = INTEGRATIONS_CONFIG.appleIntelligence;

/** The row's state while it isn't ready (what it is lives in the footer); nothing once it is. */
function appleState(access: IntegrationAccess, reason?: string): string | undefined {
  if (access === 'unknown') return COPY.checking;
  if (access === 'needs-settings') return APPLE.onboarding.needsSettings;
  if (access === 'unavailable') return reason;
  return undefined;
}

/** One sentence per option this device offers, then how to change it later. */
const FOOTER = [
  platform.hasAppleIntelligence && COPY.notes.apple,
  platform.supportsLocalServers && COPY.notes.local,
  COPY.notes.remote,
  COPY.notes.change,
].filter(Boolean).join(' ');

/** Ready: set up and go. Off: open System Settings and stay (returning re-checks). Unsupported or checking: not tappable. */
const AppleRow: React.FC = () => {
  const { access, openSettings, unavailableReason } = useAppleIntelligenceControls();
  const setup = useAppleIntelligenceSetup();
  const finish = useFinishOnboarding();
  const usable = access !== 'unknown' && access !== 'unavailable';

  const choose = () => {
    if (access === 'needs-settings') return openSettings();
    setup?.setUp();
    finish();
  };

  return (
    <CardRow
      leading={<OnboardingIcon source={ONBOARDING_ICONS.appleIntelligence} />}
      title={APPLE.title}
      description={appleState(access, unavailableReason)}
      onOpen={usable ? choose : undefined}
    />
  );
};

export const SetupStep: React.FC = () => {
  const setStep = useSetOnboardingStep();
  const finish = useFinishOnboarding();
  const openAISetup = useOpenAISetup();

  // Settings opens at Providers over the app, where the key is entered.
  const openProviders = () => {
    finish();
    openAISetup();
  };

  return (
    <WelcomeStep title={COPY.heading} secondary={{ label: ONBOARDING_CONFIG.actions.later, onClick: finish }}>
      <Section footer={FOOTER}>
        {platform.hasAppleIntelligence && <AppleRow />}
        {platform.supportsLocalServers && (
          <CardRow
            leading={<OnboardingIcon source={ONBOARDING_ICONS.local} />}
            title={COPY.local.title}
            onOpen={() => setStep('local')}
          />
        )}
        <CardRow
          leading={<OnboardingIcon source={ONBOARDING_ICONS.remote} />}
          title={COPY.remote.title}
          onOpen={openProviders}
        />
      </Section>
    </WelcomeStep>
  );
};
