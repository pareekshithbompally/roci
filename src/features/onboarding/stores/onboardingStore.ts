/** Which first-run screen shows: welcome or permissions, then AI setup (with its Local sub-view). */

import { create } from 'zustand';
import { platform } from '@platform/index';

/** `apple`, `providers` → `provider`, `local`: the AI choice's own steps; onboarding ends only when one finishes. */
export type OnboardingStep = 'welcome' | 'permissions' | 'setup' | 'apple' | 'providers' | 'provider' | 'local';

/** A device that records asks for recording access first; any other opens with the welcome (access is asked at first use). */
export const FIRST_ONBOARDING_STEP: OnboardingStep = platform.canRecord ? 'permissions' : 'welcome';

interface OnboardingState {
  step: OnboardingStep;
  /** The provider whose key the `provider` step asks for. */
  providerId: string | null;
  setStep: (step: OnboardingStep) => void;
  openProvider: (id: string) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: FIRST_ONBOARDING_STEP,
  providerId: null,
  setStep: (step) => set({ step }),
  openProvider: (providerId) => set({ step: 'provider', providerId }),
}));

export const useOnboardingStep = () => useOnboardingStore((s) => s.step);
export const useSetOnboardingStep = () => useOnboardingStore((s) => s.setStep);
export const useOnboardingProviderId = () => useOnboardingStore((s) => s.providerId);
export const useOpenOnboardingProvider = () => useOnboardingStore((s) => s.openProvider);
