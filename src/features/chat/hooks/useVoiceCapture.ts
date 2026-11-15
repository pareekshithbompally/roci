/** Single owner of chat voice input for landing and conversation: pill state, return beat, transcript append. */

import { useCallback, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Transition } from 'framer-motion';
import { useLiveDictation } from '@features/settings';
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
  const speech = useSpeechInput(settings, providers, useLiveDictation());
  const reduceMotion = useReducedMotion() ?? false;

  const isVoiceActive = speech.state !== 'idle';

  // True on the pass where the pill hands back, so chrome trails the fade; first paint is false.
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
