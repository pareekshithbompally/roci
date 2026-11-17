/** First-run: one provider's key (the same field, Test and status as Settings). Continue tests the key; once it
 *  connects, the provider is turned on, chat and summaries use its first model, and onboarding ends. */

import React, { useCallback, useEffect, useState } from 'react';
import { WelcomeStep } from '@shared/ui';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';
import { ProviderConnection, useProviderConnection } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useFinishOnboarding } from '@features/onboarding/hooks/useFinishOnboarding';
import { useOnboardingProviderId, useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

const ACTIONS = ONBOARDING_CONFIG.actions;

const KeyStep: React.FC<{ provider: ModelProvider }> = ({ provider }) => {
  const id = provider.provider;
  const connection = useProviderConnection(provider);
  const state = connection.status.state;
  const { updateProvider, setSettings } = useSettings();
  const finish = useFinishOnboarding();
  const setStep = useSetOnboardingStep();
  // Continue pressed: finish as soon as the key connects; a failure stays here with its message.
  const [continuing, setContinuing] = useState(false);
  const firstModel = provider.models?.[0]?.id;

  const use = useCallback(() => {
    updateProvider(id, { active: true });
    if (firstModel) setSettings({ chatModel: firstModel, analyzeModel: firstModel });
    finish();
  }, [id, firstModel, updateProvider, setSettings, finish]);

  useEffect(() => {
    if (!continuing) return;
    if (state === 'connected') use();
    if (state === 'failed') setContinuing(false);
  }, [continuing, state, use]);

  const proceed = () => {
    if (state === 'connected') return use();
    setContinuing(true);
    connection.test();
  };

  return (
    <WelcomeStep
      title={getProviderTitle(id)}
      primary={{
        label: state === 'checking' ? ONBOARDING_CONFIG.setup.checking : ACTIONS.continue,
        onClick: proceed,
        disabled: state === 'incomplete' || state === 'checking',
      }}
      secondary={{ label: ACTIONS.back, onClick: () => setStep('providers') }}
    >
      <ProviderConnection provider={provider} connection={connection} />
    </WelcomeStep>
  );
};

export const ProviderKeyStep: React.FC = () => {
  const id = useOnboardingProviderId();
  const provider = useSettings().providers.find((p) => p.provider === id);
  return provider ? <KeyStep provider={provider} /> : null;
};
