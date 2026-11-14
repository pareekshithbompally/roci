/**
 * Voice Extension — on-device TTS model download + readiness.
 * Speech synthesis itself lands with the TTS engine step.
 */

export { VOICE_MODEL, VOICE_DTYPE, DEFAULT_VOICE, VOICE_CONSENT_KEY, VOICE_READY_KEY, VOICE_TRAY_ID } from './constants';
export { preloadVoice, resetVoice, isVoiceReady } from './voice';
export { hasVoiceConsent, grantVoiceConsent } from './consent';
export { emitVoiceProgress, onVoiceProgress } from './progress';
export type { VoiceModelEvent, VoiceProgressEvent } from './progress';
