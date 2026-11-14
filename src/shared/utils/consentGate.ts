/**
 * Consent gate for on-device model downloads. One persisted flag per model;
 * an explicit Download click grants it directly, and implicit triggers ask
 * once through the app-wide confirm(). Concurrent requests share one prompt.
 */

import { confirm, type ConfirmRequest } from '@shared/stores/confirmStore';

const GRANTED = 'granted';

export interface ConsentGate {
  has: () => boolean;
  grant: () => void;
  /** Resolves true at once when already granted; otherwise asks the user. */
  request: () => Promise<boolean>;
}

export function createConsentGate(storageKey: string, prompt: ConfirmRequest): ConsentGate {
  let pending: Promise<boolean> | null = null;

  const has = () => localStorage.getItem(storageKey) === GRANTED;
  const grant = () => localStorage.setItem(storageKey, GRANTED);

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

  return { has, grant, request };
}
