/** Which first-run screen shows: permissions, then AI setup (with its Local sub-view). */

import { create } from 'zustand';

export type OnboardingStep = 'permissions' | 'setup' | 'local';

interface OnboardingState {
  step: OnboardingStep;
  setStep: (step: OnboardingStep) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: 'permissions',
  setStep: (step) => set({ step }),
}));

export const useOnboardingStep = () => useOnboardingStore((s) => s.step);
export const useSetOnboardingStep = () => useOnboardingStore((s) => s.setStep);
