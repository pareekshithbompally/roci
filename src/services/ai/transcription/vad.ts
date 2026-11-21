/** Speech detection by the bundled Silero model in Rust; callers treat a rejection as "transcribe everything". */

import { invoke } from '@tauri-apps/api/core';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { encodeWavInt16 } from '@shared/utils/wav.utils';
import type { SpeechRange } from './types';

/** Sorted speech spans, in samples of the pipeline's 16 kHz mono `samples`. */
export const getSpeechSegments = (samples: Float32Array): Promise<SpeechRange[]> =>
  invoke<SpeechRange[]>('stt_speech_spans', encodeWavInt16(samples, TRANSCRIPTION_CONFIG.sampleRate));
