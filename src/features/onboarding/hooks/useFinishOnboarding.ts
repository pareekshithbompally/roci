/** Ends the first-run flow: the app opens, and a later "Run setup again" starts from permissions. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

export function useFinishOnboarding(): () => void {
  const { setSettings } = useSettings();
  const setStep = useSetOnboardingStep();
  return useCallback(() => {
    setSettings({ onboarding: { completed: true } });
    setStep('permissions');
  }, [setSettings, setStep]);
}
