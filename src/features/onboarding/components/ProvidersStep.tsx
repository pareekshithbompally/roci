/** First-run: the online providers Roci has chat defaults for; a row opens its key step. */

import React from 'react';
import { CardRow, ICON_SIZE_PX, Section, WelcomeStep } from '@shared/ui';
import { ProvidersAvatar } from '@shared/components';
import { useSettings } from '@shared/contexts/SettingsContext';
import { getProviderTitle, providerSetting } from '@shared/utils/provider.utils';
import { ProviderStatus, cloudRowState } from '@features/settings';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { PROVIDER_DEFAULTS } from '@config/providerDefaults.config';
import { useOnboardingBack, useOpenOnboardingProvider } from '@features/onboarding/stores/onboardingStore';

const COPY = ONBOARDING_CONFIG.setup;

export const ProvidersStep: React.FC = () => {
  const { providers } = useSettings();
  const back = useOnboardingBack();
  const openProvider = useOpenOnboardingProvider();
  const offered = providers.filter((p) => p.provider in PROVIDER_DEFAULTS);

  return (
    <WelcomeStep title={COPY.remote.title} onBack={back}>
      <Section footer={COPY.providers.footer}>
        {offered.map((p) => (
          <CardRow
            key={p.provider}
            leading={<ProvidersAvatar provider={p.provider} size={ICON_SIZE_PX.lg} />}
            title={getProviderTitle(p.provider)}
            // A provider with no key yet is simply not set up: nothing to warn about.
            status={providerSetting(p, 'api-key') ? <ProviderStatus state={cloudRowState(p)} /> : undefined}
            onOpen={() => openProvider(p.provider)}
          />
        ))}
      </Section>
    </WelcomeStep>
  );
};
