/** First-run: the models this device downloads and runs, Western or Indic. Accepting them opens the app; the downloads carry on. */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { CardRow, Icon, Section, WelcomeStep } from '@shared/ui';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { queryKeys } from '@shared/query/queryKeys';
import { formatFileSize } from '@shared/utils/formatters';
import { localModelFreeSpace } from '@services/localModels.service';
import type { LocalModel } from '@services/localModels.service';
import type { DetectedProvider } from '@features/settings';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { DEFAULT_MODELS_CONFIG } from '@config/defaultModels.config';
import { ON_DEVICE_SETS } from '@config/providerDefaults.config';
import type { OnDeviceSet } from '@config/providerDefaults.config';
import { useGoWithDefaults } from '@features/onboarding/hooks/useGoWithDefaults';
import { useOnboardingBack } from '@features/onboarding/stores/onboardingStore';
import { DefaultsList } from '@features/settings';

const COPY = ONBOARDING_CONFIG.setup.onDevice;
const SETS = DEFAULT_MODELS_CONFIG.providerDefaults.sets;

/** What the downloads need, and whether they fit (an unknown free space doesn't stop them: a full disk fails the download). */
function useDownloadSpace(downloads: LocalModel[]): { bytes: number; fits: boolean } {
  const { data: free } = useQuery({ queryKey: queryKeys.localModelFreeSpace(), queryFn: localModelFreeSpace, staleTime: 0, refetchOnWindowFocus: 'always' });
  const bytes = downloads.reduce((sum, m) => sum + m.bytes, 0);
  return { bytes, fits: free === undefined || bytes <= free };
}

/** Western or Indic: one row each, the chosen one checked. */
const SetChoice: React.FC<{ chosen: OnDeviceSet; onChoose: (set: OnDeviceSet) => void }> = ({ chosen, onChoose }) => (
  <Section title={COPY.languages}>
    {(Object.keys(ON_DEVICE_SETS) as OnDeviceSet[]).map((set) => (
      <CardRow
        key={set}
        title={SETS[set].title}
        description={SETS[set].description}
        status={set === chosen && <Icon icon={Check} size="md" tone="accent" />}
        onPress={() => onChoose(set)}
      />
    ))}
  </Section>
);

export const OnDeviceSetup: React.FC = () => {
  const back = useOnboardingBack();
  const { data: models, isError } = useLocalModels();
  const [set, setSet] = useState<OnDeviceSet>('western');
  const detected = useMemo<DetectedProvider | null>(
    () => (models ? { id: LOCAL_MODELS_CONFIG.provider.id, listed: models.map((m) => ({ id: m.id, report: {} })), set: ON_DEVICE_SETS[set] } : null),
    [models, set],
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
      <SetChoice chosen={set} onChoose={setSet} />
      {setup && <DefaultsList defaults={setup.defaults} footer={bytes > 0 ? footer : undefined} />}
    </WelcomeStep>
  );
};
