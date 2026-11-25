/** Single owner of chat voice input for landing and conversation: pill state, how it ends, return beat, transcript append or send. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useLiveDictation } from '@features/settings';
import { haptic } from '@platform/haptics';
import { useSpeechInput } from './useSpeechInput';
import type { SpeechEnd, UseSpeechInputResult } from './useSpeechInput';
import { voiceChrome } from '@features/chat/components/voice/voiceTransition';
import type { VoiceChrome } from '@features/chat/components/voice/voiceTransition';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { AppSettings } from '@shared/types';

/** How a dictation ends, which alone sets how the pill leaves (docs/plans/IN-PROGRESS/dictation-flow.md): its words settle
 *  into the box, lift off as a sent message, none came, transcription failed, or it was cancelled. */
export type VoiceEnding = 'box' | 'send' | 'empty' | 'failed' | 'quiet';

/** What the user asked for: Stop puts the words in the box, Send sends them. */
type Intent = 'box' | 'send';

const ENDING_OF: Record<Exclude<SpeechEnd, 'text'>, VoiceEnding> = { empty: 'empty', failed: 'failed', aborted: 'quiet' };

/** The ending for how speech ended and what was asked; while capturing (`null`), the intent so far. */
export function voiceEnding(ended: SpeechEnd | null, intent: Intent): VoiceEnding {
  return ended === null || ended === 'text' ? intent : ENDING_OF[ended];
}

export interface UseVoiceCaptureOptions {
  settings: AppSettings;
  providers: ModelProvider[];
  /** Appends a finished transcript to the composer (owns input state). */
  appendTranscript: (text: string) => void;
  /** Sends the composer's draft, which a transcript was just appended to. */
  send: () => void;
}

export interface UseVoiceCaptureResult {
  speech: UseSpeechInputResult;
  isVoiceActive: boolean;
  ending: VoiceEnding;
  /** How the chrome around the composer steps aside and comes back. */
  chrome: VoiceChrome;
  /** Stop: the transcript goes into the box. */
  handleSpeechStop: () => Promise<void>;
  /** Send: the transcript is sent once the pill has left (`handleVoiceGone`). */
  handleSpeechSend: () => Promise<void>;
  /** The pill has finished leaving: a waiting Send goes out now, so the message never races the pill. */
  handleVoiceGone: () => void;
}

export function useVoiceCapture({
  settings,
  providers,
  appendTranscript,
  send,
}: UseVoiceCaptureOptions): UseVoiceCaptureResult {
  const speech = useSpeechInput(settings, providers, useLiveDictation());
  const reduceMotion = useReducedMotion() ?? false;

  const isVoiceActive = speech.state !== 'idle';
  const [intent, setIntent] = useState<Intent>('box');
  const ending = voiceEnding(speech.ended, intent);
  /** A sent transcript waiting for the pill to leave. */
  const pendingSend = useRef<string | null>(null);
  /** Words went into the box: felt once the pill has left, as a sent message is. */
  const landed = useRef(false);

  // True on the pass where the pill hands back, so chrome trails the fade; first paint is false.
  const prevVoiceActiveRef = useRef(false);
  useEffect(() => {
    prevVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);
  const returningFromVoice = !isVoiceActive && prevVoiceActiveRef.current;

  // If the composer goes away before the pill has left (a chat switch), a waiting Send stays in the draft: never lost,
  // never sent somewhere else.
  const appendRef = useRef(appendTranscript);
  useEffect(() => {
    appendRef.current = appendTranscript;
  }, [appendTranscript]);
  useEffect(() => () => {
    if (pendingSend.current) appendRef.current(pendingSend.current);
  }, []);

  const handleSpeechStop = useCallback(async () => {
    setIntent('box');
    const text = await speech.stop();
    if (!text) return;
    appendTranscript(text);
    landed.current = true;
  }, [speech, appendTranscript]);

  const handleSpeechSend = useCallback(async () => {
    setIntent('send');
    const text = await speech.stop();
    if (text) pendingSend.current = text;
  }, [speech]);

  // One light tap when the words have landed (in the box, or sent), as the pill finishes leaving.
  const handleVoiceGone = useCallback(() => {
    const text = pendingSend.current;
    pendingSend.current = null;
    if (text) {
      appendTranscript(text);
      send();
    }
    if (text || landed.current) haptic('landed');
    landed.current = false;
  }, [appendTranscript, send]);

  return {
    speech,
    isVoiceActive,
    ending,
    chrome: voiceChrome(isVoiceActive, returningFromVoice, reduceMotion),
    handleSpeechStop,
    handleSpeechSend,
    handleVoiceGone,
  };
}
