/** Ends the first-run flow: the app opens, and a later "Run setup again" starts from the first step. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { FIRST_ONBOARDING_STEP, useSetOnboardingStep } from '@features/onboarding/stores/onboardingStore';

export function useFinishOnboarding(): () => void {
  const { setSettings } = useSettings();
  const setStep = useSetOnboardingStep();
  return useCallback(() => {
    setSettings({ onboarding: { completed: true } });
    setStep(FIRST_ONBOARDING_STEP);
  }, [setSettings, setStep]);
}
