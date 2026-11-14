/**
 * useVoiceCapture
 *
 * The single owner of the chat voice-input experience, shared by the idle
 * landing view and the open conversation alike. Wraps useSpeechInput with:
 *   - isVoiceActive: the pill owns the composer slot (capture, warm-up,
 *     transcription, or the handoff beat after it).
 *   - returningFromVoice + chromeEnter: the second beat of the return —
 *     titles above and buttons below trail the pill fade together.
 *   - handleSpeechStop: stops the capture and appends the transcript.
 *
 * Callers stay thin: render chrome gated on isVoiceActive with chromeEnter,
 * and drive ChatInput from speech + handleSpeechStop.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Transition } from 'framer-motion';
import { useSpeechInput } from './useSpeechInput';
import type { UseSpeechInputResult } from './useSpeechInput';
import { voiceChromeEnter } from '@features/chat/components/voice/voiceTransition';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { AppSettings } from '@shared/types';

export interface UseVoiceCaptureOptions {
  settings: AppSettings;
  providers: ModelProvider[];
  /** Appends a finished transcript to the composer (owns input state). */
  appendTranscript: (text: string) => void;
}

export interface UseVoiceCaptureResult {
  speech: UseSpeechInputResult;
  isVoiceActive: boolean;
  returningFromVoice: boolean;
  chromeEnter: Transition;
  handleSpeechStop: () => Promise<void>;
}

export function useVoiceCapture({
  settings,
  providers,
  appendTranscript,
}: UseVoiceCaptureOptions): UseVoiceCaptureResult {
  const speech = useSpeechInput(settings, providers);
  const reduceMotion = useReducedMotion() ?? false;

  const isVoiceActive = speech.state !== 'idle';

  // True on the pass where the pill hands back to the composer, so the
  // chrome trails the pill fade instead of popping in first. First paint
  // always reads false, so load-in is unaffected.
  const prevVoiceActiveRef = useRef(false);
  useEffect(() => {
    prevVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);
  const returningFromVoice = !isVoiceActive && prevVoiceActiveRef.current;

  const handleSpeechStop = useCallback(async () => {
    const text = await speech.stop();
    if (text) appendTranscript(text);
  }, [speech, appendTranscript]);

  return {
    speech,
    isVoiceActive,
    returningFromVoice,
    chromeEnter: voiceChromeEnter(returningFromVoice, reduceMotion),
    handleSpeechStop,
  };
}
