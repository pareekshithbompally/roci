/** First-run: the models this device downloads and runs. Accepting them opens the app; the downloads carry on. */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WelcomeStep } from '@shared/ui';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { queryKeys } from '@shared/query/queryKeys';
import { formatFileSize } from '@shared/utils/formatters';
import { localModelFreeSpace } from '@services/localModels.service';
import type { LocalModel } from '@services/localModels.service';
import type { DetectedProvider } from '@features/settings';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useGoWithDefaults } from '@features/onboarding/hooks/useGoWithDefaults';
import { useOnboardingBack } from '@features/onboarding/stores/onboardingStore';
import { DefaultsList } from './DefaultsList';

const COPY = ONBOARDING_CONFIG.setup.onDevice;

/** What the downloads need, and whether they fit (an unknown free space doesn't stop them: a full disk fails the download). */
function useDownloadSpace(downloads: LocalModel[]): { bytes: number; fits: boolean } {
  const { data: free } = useQuery({ queryKey: queryKeys.localModelFreeSpace(), queryFn: localModelFreeSpace, staleTime: 0, refetchOnWindowFocus: 'always' });
  const bytes = downloads.reduce((sum, m) => sum + m.bytes, 0);
  return { bytes, fits: free === undefined || bytes <= free };
}

export const OnDeviceSetup: React.FC = () => {
  const back = useOnboardingBack();
  const { data: models, isError } = useLocalModels();
  const detected = useMemo<DetectedProvider | null>(
    () => (models ? { id: LOCAL_MODELS_CONFIG.provider.id, listed: models.map((m) => ({ id: m.id, report: {} })) } : null),
    [models],
  );
  const { setup, action } = useGoWithDefaults(detected);
  const { bytes, fits } = useDownloadSpace(setup?.downloads ?? []);
  const size = formatFileSize(bytes);
  const footer = fits ? COPY.size(size) : COPY.noSpace(size);

  return (
    <WelcomeStep
      title={COPY.title}
      subtitle={isError ? COPY.unavailable : COPY.subtitle}
      primary={{ ...action, disabled: action.disabled || !fits }}
      onBack={back}
    >
      {setup && <DefaultsList defaults={setup.defaults} footer={bytes > 0 ? footer : undefined} />}
    </WelcomeStep>
  );
};
