/** Ends the first-run flow: the app opens, leaving Settings when setup was run again from there. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useAppActions } from '@shared/stores/appStore';
import { useResetOnboarding } from '@features/onboarding/stores/onboardingStore';

export function useFinishOnboarding(): () => void {
  const { setSettings } = useSettings();
  const reset = useResetOnboarding();
  const { leaveSettings } = useAppActions();
  return useCallback(() => {
    setSettings({ onboarding: { completed: true } });
    reset();
    leaveSettings();
  }, [setSettings, reset, leaveSettings]);
}
