/** Which first-run screen shows: welcome or permissions, then AI setup (with its Local sub-view). */

import { create } from 'zustand';
import { platform } from '@platform/index';

export type OnboardingStep = 'welcome' | 'permissions' | 'setup' | 'local';

/** A device that records asks for recording access first; any other opens with the welcome (access is asked at first use). */
export const FIRST_ONBOARDING_STEP: OnboardingStep = platform.canRecord ? 'permissions' : 'welcome';

interface OnboardingState {
  step: OnboardingStep;
  setStep: (step: OnboardingStep) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: FIRST_ONBOARDING_STEP,
  setStep: (step) => set({ step }),
}));

export const useOnboardingStep = () => useOnboardingStore((s) => s.step);
export const useSetOnboardingStep = () => useOnboardingStore((s) => s.setStep);
