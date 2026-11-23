/** Go with Defaults, for any detected provider: the step's button (off without a chat model) and what its list shows. */

import { useProviderDefaults } from '@features/settings';
import type { DetectedProvider, ProviderDefaultsSetup } from '@features/settings';
import type { WelcomeAction } from '@shared/ui';
import { ONBOARDING_CONFIG } from '@config/onboarding.config';
import { useFinishOnboarding } from './useFinishOnboarding';

export interface GoWithDefaults {
  /** Null until a provider is detected. */
  setup: ProviderDefaultsSetup | null;
  action: WelcomeAction;
}

export function useGoWithDefaults(detected: DetectedProvider | null): GoWithDefaults {
  const setup = useProviderDefaults(detected);
  const finish = useFinishOnboarding();
  const accept = () => {
    setup?.apply();
    finish();
  };
  return { setup, action: { label: ONBOARDING_CONFIG.setup.defaults.accept, onClick: accept, disabled: !setup?.defaults.chat } };
}
