/** First-run step 2: the AI Roci uses. Apple Intelligence on this Mac, a local server, a remote provider, or later. */

import React from 'react';
import { Button, Text } from '@shared/ui';
import { ActionCard } from '@shared/components';
import { useAppActions } from '@shared/stores/appStore';
import { useAppleIntelligenceControls, useAppleIntelligenceSetup } from '@features/integrations';
import type { IntegrationAccess } from '@features/integrations';
import { platform } from '@platform/index';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { ONBOARDING_CONFIG, ONBOARDING_ICONS } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';
import { OnboardingIcon } from './OnboardingIcon';

const COPY = ONBOARDING_CONFIG.setup;
const APPLE = INTEGRATIONS_CONFIG.appleIntelligence;

/** The tile's state line; none once Apple Intelligence is ready. */
const AppleStatus: React.FC<{ access: IntegrationAccess; reason?: string }> = ({ access, reason }) => {
  if (access === 'unknown') return <Text as="p" variant="helper" tone="faint">{COPY.checking}</Text>;
  if (access === 'needs-settings') return <Text as="p" variant="helper" tone="warning">{APPLE.onboarding.needsSettings}</Text>;
  if (access === 'unavailable') return <Text as="p" variant="helper" tone="faint">{reason}</Text>;
  return null;
};

/** Ready: set up and go. Off: open System Settings and stay (returning re-checks). Unsupported: disabled, with why. */
const AppleTile: React.FC = () => {
  const { access, openSettings, unavailableReason } = useAppleIntelligenceControls();
  const setup = useAppleIntelligenceSetup();
  const finish = useFinishOnboarding();

  const choose = () => {
    if (access === 'needs-settings') return openSettings();
    setup?.setUp();
    finish();
  };

  return (
    <ActionCard
      icon={<OnboardingIcon source={ONBOARDING_ICONS.appleIntelligence} />}
      tone="brand"
      title={APPLE.title}
      description={APPLE.onboarding.description}
      status={<AppleStatus access={access} reason={unavailableReason} />}
      disabled={access === 'unknown' || access === 'unavailable'}
      onClick={choose}
    />
  );
};

export const SetupStep: React.FC = () => {
  const setStep = useSetOnboardingStep();
  const finish = useFinishOnboarding();
  const { setActiveSettingsPanel, setCurrentView } = useAppActions();

  const openProviders = () => {
    setActiveSettingsPanel('providers');
    setCurrentView('settings');
    finish();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <Text as="h1" variant="pageTitle">{COPY.heading}</Text>
        <Text as="p" variant="helper" tone="muted">{COPY.subheading}</Text>
      </div>
      <div className="flex w-full flex-col gap-3">
        {platform.hasAppleIntelligence && <AppleTile />}
        {platform.supportsLocalServers && (
          <ActionCard
            icon={<OnboardingIcon source={ONBOARDING_ICONS.local} />}
            tone="brand"
            title={COPY.local.title}
            description={COPY.local.description}
            onClick={() => setStep('local')}
          />
        )}
        <ActionCard
          icon={<OnboardingIcon source={ONBOARDING_ICONS.remote} />}
          tone="brand"
          title={COPY.remote.title}
          description={COPY.remote.description}
          onClick={openProviders}
        />
      </div>
      <Button variant="ghost" size="sm" onClick={finish}>{ONBOARDING_CONFIG.actions.later}</Button>
    </div>
  );
};
