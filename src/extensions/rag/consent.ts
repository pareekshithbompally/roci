/** Embedding model download consent (see createConsentGate). */

import { createConsentGate } from '@shared/utils/consentGate';

const gate = createConsentGate('rag_model_consent', {
  title: 'Download the search model?',
  description: '≈325 MB, one time. It runs on your Mac; nothing leaves it.',
  confirmLabel: 'Download',
});

export const hasConsent = gate.has;
export const grantConsent = gate.grant;
export const requestConsent = gate.request;
