/** First-run: Apple Intelligence — its defaults once it is ready, or what stands in the way. */

import React, { useMemo } from 'react';
import { WelcomeStep } from '@shared/ui';
import { useAppleIntelligenceControls } from '@features/integrations';
import type { IntegrationAccess } from '@features/integrations';
import type { DetectedProvider } from '@features/settings';
import { platform } from '@platform/index';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useGoWithDefaults } from '@features/onboarding/hooks/useGoWithDefaults';
import { useOnboardingBack } from '@features/onboarding/stores/onboardingStore';
import { DefaultsList } from '@features/settings';

const COPY = ONBOARDING_CONFIG.setup;
const APPLE = INTEGRATIONS_CONFIG.appleIntelligence;

/** Its state, in one sentence under the title. */
function subtitleFor(access: IntegrationAccess, reason?: string): string | undefined {
  if (access === 'unknown') return COPY.checking;
  if (access === 'needs-settings') return COPY.apple.needsSettings;
  if (access === 'unavailable') return reason;
  return COPY.apple.ready;
}

export const AppleStep: React.FC = () => {
  const { access, openSettings, unavailableReason } = useAppleIntelligenceControls();
  const back = useOnboardingBack();
  const detected = useMemo<DetectedProvider | null>(
    () => (access === 'ready' ? { id: APPLE_INTELLIGENCE.provider, listed: [{ id: APPLE_INTELLIGENCE.model, report: {} }] } : null),
    [access],
  );
  const { setup, action } = useGoWithDefaults(detected);
  const primary = access === 'needs-settings' && platform.canOpenSettingsPanes
    ? { label: ONBOARDING_CONFIG.actions.openSettings, onClick: openSettings }
    : action;

  return (
    <WelcomeStep icon={APPLE.icon} title={APPLE.title} subtitle={subtitleFor(access, unavailableReason)} primary={primary} onBack={back}>
      {setup && <DefaultsList defaults={setup.defaults} />}
    </WelcomeStep>
  );
};
