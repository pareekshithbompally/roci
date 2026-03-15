/**
 * RAG Model Download Consent
 *
 * Gates the embedding model download behind user confirmation.
 * Uses an event-based bridge so the non-React embedding service
 * can trigger the React confirmation modal.
 */

import { CONSENT_TIMEOUT_MS } from './constants';

const CONSENT_STORAGE_KEY = 'kasset_rag_model_consent';

type ConsentResolver = (granted: boolean) => void;

let pendingResolver: ConsentResolver | null = null;
let listener: ((resolve: ConsentResolver) => void) | null = null;

/** Check if user has already consented (persisted) */
export function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

/** Persist the consent decision */
export function setConsent(granted: boolean): void {
  try {
    if (granted) {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    } else {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Request consent from the user. Returns a promise that resolves
 * when the user accepts or rejects.
 *
 * If consent was previously granted, resolves immediately.
 * If no modal listener is registered, resolves false (fail-open).
 */
export function requestConsent(): Promise<boolean> {
  if (hasConsent()) return Promise.resolve(true);

  if (!listener) {
    console.warn('[RAGConsent] No modal listener registered, denying by default');
    return Promise.resolve(false);
  }

  // If there's already a pending request, wait for it
  if (pendingResolver) {
    return new Promise(resolve => {
      const prev = pendingResolver!;
      pendingResolver = (granted) => {
        prev(granted);
        resolve(granted);
      };
    });
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      console.warn('[RAGConsent] Consent request timed out');
      pendingResolver = null;
      resolve(false);
    }, CONSENT_TIMEOUT_MS);

    pendingResolver = (granted) => {
      clearTimeout(timer);
      if (granted) setConsent(true);
      pendingResolver = null;
      resolve(granted);
    };
    listener!(pendingResolver);
  });
}

/**
 * Called by the React modal component to register itself.
 * The callback is invoked when consent is needed, passing a resolver.
 */
export function onConsentNeeded(cb: (resolve: ConsentResolver) => void): () => void {
  listener = cb;
  return () => { listener = null; };
}

/**
 * Revoke previously granted consent (e.g. from settings).
 */
export function revokeConsent(): void {
  setConsent(false);
}
