/**
 * Voice Extension — read aloud: built-in macOS voices plus downloadable
 * on-device voices (Kokoro, Supertonic), speak/stop, download progress.
 */

export {
  DEFAULT_VOICE,
  DOWNLOADABLE_VOICES,
  DOWNLOADABLE_VOICE_IDS,
  MACOS_VOICE,
  voiceTrayId,
} from './constants';
export type { DownloadableVoiceId, VoiceId } from './constants';
export { isVoiceReady, loadVoice, resetVoice, speak, stopSpeaking } from './voice';
export { emitVoiceProgress, onVoiceProgress } from './progress';
export type { VoiceModelEvent, VoiceProgressEvent } from './progress';
