/** The composer's voice pill: the scope, the live words under it, then Stop + Pause (and the clock) while recording, or only
 *  Cancel while transcribing. An overlay that moves no layout; it rises in and sinks back mirrored. */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Square, X } from 'lucide-react';
import { IconButton, Text } from '@shared/ui';
import { DotScope } from '@features/chat/components/dot-scope';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import { formatClock } from '@shared/utils/formatters';
import type { LiveText } from '@services/ai/transcription';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { LiveTranscript } from './LiveTranscript';
import { voiceTransition, voicePillSettled, voicePillCollapsed } from './voiceTransition';
import type { VoicePillState } from './useVoicePill';

const COMPOSER_SCOPE = DOT_SCOPE_CONFIG.composer;
const SCOPE_ZOOM = COMPOSER_SCOPE.plateHeight / DOT_SCOPE_CONFIG.tuning.height;

interface VoicePillProps {
  pill: VoicePillState;
  speechState: SpeechState;
  stream: MediaStream | null;
  liveText: LiveText | null;
  /** Seconds recorded so far. */
  elapsed: number;
  reduceMotion: boolean;
  onStop?: () => void;
  onTogglePause?: () => void;
  onCancel?: () => void;
}

/** One beat of controls under the pill; a swap fades the old out before the new comes in. */
function ControlBeat({ reduceMotion, children }: { reduceMotion: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: voiceTransition(reduceMotion, 'controlOut') }}
      transition={voiceTransition(reduceMotion, 'controlIn')}
    >
      {children}
    </motion.div>
  );
}

type Controls = Pick<VoicePillProps, 'speechState' | 'elapsed' | 'onStop' | 'onTogglePause' | 'onCancel'>;

/** The controls' beat: Stop + Pause while recording or paused (one beat, so pausing doesn't swap them), Cancel while
 *  transcribing, none while starting. */
const beatOf = (speechState: SpeechState): 'controls' | 'cancel' | null => {
  if (speechState === 'recording' || speechState === 'paused') return 'controls';
  return speechState === 'transcribing' ? 'cancel' : null;
};

function RecordingControls({ speechState, elapsed, onStop, onTogglePause }: Controls) {
  const paused = speechState === 'paused';
  return (
    <>
      <div className="flex items-center gap-2">
        {/* Stop ends the capture; transcription takes over. */}
        <IconButton icon={Square} label="Stop recording" variant="danger" filled onClick={onStop} />
        <IconButton icon={paused ? Play : Pause} filled label={paused ? 'Resume recording' : 'Pause recording'} variant="outline" onClick={onTogglePause} />
      </div>
      <Text variant="caption" tone="muted" className="tabular-nums leading-none">{formatClock(elapsed)}</Text>
    </>
  );
}

export const VoicePill: React.FC<VoicePillProps> = ({ pill, speechState, stream, liveText, reduceMotion, ...controls }) => {
  const beat = beatOf(speechState);
  return (
    <motion.div
      data-testid="voice-pill"
      role="region"
      aria-label={pill.label}
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-4 py-4"
      initial={voicePillCollapsed}
      animate={voicePillSettled}
      exit={{ ...voicePillCollapsed, transition: voiceTransition(reduceMotion, 'pillOut') }}
      transition={voiceTransition(reduceMotion, 'pillIn')}
    >
      <DotScope
        stage={pill.stage}
        stream={speechState === 'paused' ? null : stream}
        label={pill.label}
        zoom={SCOPE_ZOOM}
        margins={{ x: COMPOSER_SCOPE.marginX, y: COMPOSER_SCOPE.marginY }}
      />
      {/* Live words sit right under the pill; the controls go below them, so neither squeezes the other on a phone. */}
      {liveText && <LiveTranscript text={liveText} />}
      {/* Fixed height keeps the pill pinned while its controls swap. */}
      <div className="mt-3 flex h-16 items-start justify-center">
        <AnimatePresence initial={false} mode="wait">
          {beat && (
            <ControlBeat key={beat} reduceMotion={reduceMotion}>
              {beat === 'controls' ? (
                <RecordingControls speechState={speechState} {...controls} />
              ) : (
                // The pill already reads "Transcribing", so cancel is the only control.
                <IconButton icon={X} label="Cancel voice input" variant="danger" onClick={controls.onCancel} />
              )}
            </ControlBeat>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
