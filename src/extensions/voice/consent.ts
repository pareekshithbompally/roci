/**
 * Voice (TTS) model download consent (see createConsentGate).
 */

import { createConsentGate } from '@shared/utils/consentGate';
import { VOICE_CONSENT_KEY } from './constants';

const gate = createConsentGate(VOICE_CONSENT_KEY, {
  title: 'Download the read-aloud voice?',
  description: '≈95 MB, one time. It runs on your Mac; nothing leaves it.',
  confirmLabel: 'Download',
});

export const hasVoiceConsent = gate.has;
export const grantVoiceConsent = gate.grant;
export const requestVoiceConsent = gate.request;
