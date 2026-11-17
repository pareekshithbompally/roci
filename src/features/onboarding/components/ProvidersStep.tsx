/** First-run: the online providers that can chat, each with its state; a row opens its key step. Back returns to the choice. */

import React from 'react';
import { CardRow, ICON_SIZE_PX, Section, WelcomeStep } from '@shared/ui';
import { ProvidersAvatar } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { canListModels } from '@shared/utils/modelResolver';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { ProviderStatus, cloudRowState } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useOpenOnboardingProvider, useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

const COPY = ONBOARDING_CONFIG.setup;

export const ProvidersStep: React.FC = () => {
  const { providers } = useSettings();
  const setStep = useSetOnboardingStep();
  const openProvider = useOpenOnboardingProvider();
  // Chat needs a provider whose models can be listed (speech-only ones are set up in Settings).
  const chatProviders = providers.filter((p) => !isLocalProviderId(p.provider) && canListModels(p));

  return (
    <WelcomeStep title={COPY.remote.title} secondary={{ label: ONBOARDING_CONFIG.actions.back, onClick: () => setStep('setup') }}>
      <Section footer={COPY.providers.footer}>
        {chatProviders.map((p) => (
          <CardRow
            key={p.provider}
            leading={<ProvidersAvatar provider={p.provider} size={ICON_SIZE_PX.lg} />}
            title={getProviderTitle(p.provider)}
            status={<ProviderStatus state={cloudRowState(p)} />}
            onOpen={() => openProvider(p.provider)}
          />
        ))}
      </Section>
    </WelcomeStep>
  );
};
