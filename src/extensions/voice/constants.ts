/**
 * Voice (TTS) Constants
 *
 * Single source of truth for the on-device speech model. Like RAG, the model
 * is downloaded on demand and cached — nothing is embedded in the bundle.
 */

/** Kokoro TTS weights (verified on transformers v4, q8, single runtime). */
export const VOICE_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const VOICE_DTYPE = 'q8' as const;
/** Default voice (af_heart = Heart, en-us Female). */
export const DEFAULT_VOICE = 'af_heart';

/** Persisted consent + readiness flags (localStorage, mirrored per model). */
export const VOICE_CONSENT_KEY = 'voice_model_consent';
export const VOICE_READY_KEY = 'voice_model_ready';

/** ActivityTray row id for the voice model download. */
export const VOICE_TRAY_ID = 'voice-model';
