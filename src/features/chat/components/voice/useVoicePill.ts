/** When the composer's voice pill shows, and what it says: it holds through a handoff beat after transcription so the
 *  processing state is seen, and Escape cancels the capture at every stage. */

import { useEffect, useState } from 'react';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { VOICE_HANDOFF_S } from './voiceTransition';

export interface VoicePillState {
  /** The pill owns the composer's slot: capture under way, or its handoff beat. */
  active: boolean;
  /** Recording shape from the mic press (flat traces while warming up); processing once transcription starts. */
  stage: 'recording' | 'processing';
  label: string;
}

function labelOf(speechState: SpeechState, processing: boolean): string {
  if (processing) return 'Transcribing';
  if (speechState === 'starting') return 'Starting';
  return speechState === 'paused' ? 'Paused' : 'Recording';
}

export function useVoicePill(speechState: SpeechState, onCancel?: () => void): VoicePillState {
  const capturing = speechState !== 'idle';
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (capturing) {
      setHolding(true);
      return;
    }
    const timer = setTimeout(() => setHolding(false), VOICE_HANDOFF_S * 1000);
    return () => clearTimeout(timer);
  }, [capturing]);

  const active = capturing || holding;
  const processing = speechState === 'transcribing' || (!capturing && holding);

  useEffect(() => {
    if (!active || !onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onCancel]);

  return { active, stage: processing ? 'processing' : 'recording', label: labelOf(speechState, processing) };
}
