/** On-device download consent: one flag per model; Download grants it, implicit triggers share one confirm(). */

import { confirm, type ConfirmRequest } from '@shared/stores/confirmStore';

const GRANTED = 'granted';

export interface ConsentGate {
  has: () => boolean;
  grant: () => void;
  /** Withdraws consent, so nothing downloads the model again until the user agrees. */
  revoke: () => void;
  /** Resolves true at once when already granted; otherwise asks the user. */
  request: () => Promise<boolean>;
}

export function createConsentGate(storageKey: string, prompt: ConfirmRequest): ConsentGate {
  let pending: Promise<boolean> | null = null;

  const has = () => localStorage.getItem(storageKey) === GRANTED;
  const grant = () => localStorage.setItem(storageKey, GRANTED);
  const revoke = () => localStorage.removeItem(storageKey);

  const ask = async (): Promise<boolean> => {
    const granted = await confirm(prompt);
    if (granted) grant();
    pending = null;
    return granted;
  };

  const request = () => {
    if (has()) return Promise.resolve(true);
    pending ??= ask();
    return pending;
  };

  return { has, grant, revoke, request };
}
