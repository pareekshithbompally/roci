/** Embedding model download consent (see createConsentGate). */

import { createConsentGate } from '@shared/utils/consentGate';
import { EMBEDDING_MODEL_SIZE } from './constants';

const gate = createConsentGate('rag_model_consent', {
  title: 'Download the search model?',
  description: `${EMBEDDING_MODEL_SIZE}, one time. It runs on your Mac; nothing leaves it.`,
  confirmLabel: 'Download',
});

export const hasConsent = gate.has;
export const grantConsent = gate.grant;
export const revokeConsent = gate.revoke;
export const requestConsent = gate.request;
