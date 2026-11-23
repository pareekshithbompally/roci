/** First-run: one provider's key (the same field, Test and status as Settings). Continue tests it; once it connects, the
 *  provider's defaults show below. */

import React, { useMemo } from 'react';
import { WelcomeStep } from '@shared/ui';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';
import { ProviderConnection, useProviderConnection } from '@features/settings';
import type { DetectedProvider } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useGoWithDefaults } from '@features/onboarding/hooks/useGoWithDefaults';
import { useOnboardingBack, useOnboardingProviderId } from '@features/onboarding/stores/onboardingStore';
import { DefaultsList } from './DefaultsList';

const KeyStep: React.FC<{ provider: ModelProvider }> = ({ provider }) => {
  const connection = useProviderConnection(provider);
  const { status, test } = connection;
  const back = useOnboardingBack();
  const listed = status.state === 'connected' ? status.models : null;
  const detected = useMemo<DetectedProvider | null>(() => listed && { id: provider.provider, listed, provider }, [listed, provider]);
  const { setup, action } = useGoWithDefaults(detected);
  const checking = status.state === 'checking';
  const testKey = {
    label: checking ? ONBOARDING_CONFIG.setup.checking : ONBOARDING_CONFIG.actions.continue,
    onClick: test,
    disabled: checking || status.state === 'incomplete',
  };

  return (
    <WelcomeStep title={getProviderTitle(provider.provider)} primary={setup ? action : testKey} onBack={back}>
      <ProviderConnection provider={provider} connection={connection} />
      {setup && <DefaultsList defaults={setup.defaults} />}
    </WelcomeStep>
  );
};

export const ProviderKeyStep: React.FC = () => {
  const id = useOnboardingProviderId();
  const provider = useSettings().providers.find((p) => p.provider === id);
  return provider ? <KeyStep provider={provider} /> : null;
};
