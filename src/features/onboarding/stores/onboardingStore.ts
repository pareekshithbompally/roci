/** Which first-run screen shows, and whether Settings asked to run setup again. */

import { create } from 'zustand';
import { platform } from '@platform/index';

/** Welcome, permissions (the Mac), the AI choice, then that choice's own steps. */
export type OnboardingStep = 'welcome' | 'permissions' | 'setup' | 'apple' | 'providers' | 'provider' | 'local' | 'onDevice';

const FIRST_STEP: OnboardingStep = 'welcome';

/** The Mac asks for recording access before the AI choice (system audio needs System Settings). */
export const STEP_AFTER_WELCOME: OnboardingStep = platform.canCaptureSystemAudio ? 'permissions' : 'setup';

/** Where Back goes. */
const PREVIOUS: Partial<Record<OnboardingStep, OnboardingStep>> = {
  permissions: 'welcome',
  setup: platform.canCaptureSystemAudio ? 'permissions' : 'welcome',
  apple: 'setup',
  providers: 'setup',
  provider: 'providers',
  local: 'setup',
  onDevice: 'setup',
};

interface OnboardingState {
  step: OnboardingStep;
  /** Run Setup Again: shown over a finished setup, which stays as it is until new defaults are accepted. */
  rerun: boolean;
  /** The provider whose key the `provider` step asks for. */
  providerId: string | null;
  setStep: (step: OnboardingStep) => void;
  back: () => void;
  openProvider: (id: string) => void;
  runAgain: () => void;
  /** Ends the flow; the next run starts at the first step. */
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: FIRST_STEP,
  rerun: false,
  providerId: null,
  setStep: (step) => set({ step }),
  back: () => set((s) => ({ step: PREVIOUS[s.step] ?? s.step })),
  openProvider: (providerId) => set({ step: 'provider', providerId }),
  runAgain: () => set({ step: FIRST_STEP, rerun: true }),
  reset: () => set({ step: FIRST_STEP, rerun: false, providerId: null }),
}));

export const useOnboardingStep = () => useOnboardingStore((s) => s.step);
export const useIsSetupRerun = () => useOnboardingStore((s) => s.rerun);
export const useSetOnboardingStep = () => useOnboardingStore((s) => s.setStep);
export const useOnboardingBack = () => useOnboardingStore((s) => s.back);
export const useOnboardingProviderId = () => useOnboardingStore((s) => s.providerId);
export const useOpenOnboardingProvider = () => useOnboardingStore((s) => s.openProvider);
export const useRunSetupAgain = () => useOnboardingStore((s) => s.runAgain);
export const useResetOnboarding = () => useOnboardingStore((s) => s.reset);
