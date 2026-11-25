/** When the composer's voice pill shows, and what it says. After capture it holds for as long as its ending asks
 *  (`HORIZON_CONFIG.composer.hold`) before it leaves; Escape cancels the capture at every stage. */

import { useEffect, useState } from 'react';
import { HORIZON_CONFIG } from '@config/horizon.config';
import { DICTATION_COPY } from '@config/chat.config';
import type { HorizonStage } from '@config/horizon.config';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import type { VoiceEnding } from '@features/chat/hooks/useVoiceCapture';

export interface VoicePillState {
  /** The pill owns the composer's slot: capture under way, or its ending's hold. */
  active: boolean;
  /** Recording from the mic press (a flat line while warming up), processing once transcription starts, failed on error. */
  stage: HorizonStage;
  /** How the capture ends, so the pill holds and leaves the right way. */
  ending: VoiceEnding;
  label: string;
}

const { hold } = HORIZON_CONFIG.composer;

const { label } = DICTATION_COPY;

/** The line's look while the ending holds: red for a failure, else the teal of a finished transcription. */
const endedStage = (ending: VoiceEnding): HorizonStage => (ending === 'failed' ? 'failed' : 'processing');

export function useVoicePill(speechState: SpeechState, ending: VoiceEnding, onCancel?: () => void): VoicePillState {
  const capturing = speechState !== 'idle';
  const seconds = hold[ending];
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (capturing) {
      setHolding(true);
      return;
    }
    const timer = setTimeout(() => setHolding(false), seconds * 1000);
    return () => clearTimeout(timer);
  }, [capturing, seconds]);

  // An ending with no hold lets go in the very render that ends capture; the effect above only tidies up.
  const active = capturing || (holding && seconds > 0);

  useEffect(() => {
    if (!active || !onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onCancel]);

  if (capturing) {
    const stage = speechState === 'transcribing' ? 'processing' : 'recording';
    return { active, stage, ending, label: label[speechState] };
  }
  return { active, stage: endedStage(ending), ending, label: label[ending] };
}
