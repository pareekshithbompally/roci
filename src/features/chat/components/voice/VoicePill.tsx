/** The composer while dictating: the words as they're spoken, and under them the Horizon line with the clock, Stop (the words go
 *  into the box) and Send (they're sent). An overlay that moves no layout; how it leaves is set by its ending
 *  (docs/plans/IN-PROGRESS/dictation-flow.md). */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Square, X } from 'lucide-react';
import { IconButton, Surface, Text } from '@shared/ui';
import { Horizon } from '@features/chat/components/horizon';
import { DICTATION_COPY } from '@config/chat.config';
import { formatClock } from '@shared/utils/formatters';
import type { LiveText } from '@services/ai/transcription';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import type { VoiceEnding } from '@features/chat/hooks/useVoiceCapture';
import { LiveTranscript } from './LiveTranscript';
import { voiceTransition, voicePillSettled, voicePillCollapsed, voicePillLifted, voiceFaded, voiceBeatAway, voiceBeatShown } from './voiceTransition';
import type { VoicePillState } from './useVoicePill';

type ControlSize = 'sm' | 'md';

interface VoicePillProps {
  pill: VoicePillState;
  speechState: SpeechState;
  stream: MediaStream | null;
  liveText: LiveText | null;
  /** Seconds recorded so far. */
  elapsed: number;
  reduceMotion: boolean;
  /** Send is offered only while a message can go out (not while a reply is being written). */
  canSend: boolean;
  /** The live stream dropped: its words stay and finishing says "Transcribing…". */
  liveLost: boolean;
  /** Over a conversation: a backdrop keeps the words off the messages behind. */
  backdrop: boolean;
  /** The composer's own control size (44 pt on a phone). */
  controlSize: ControlSize;
  onStop?: () => void;
  onSend?: () => void;
  onCancel?: () => void;
}

/** What sits at the line's end: the clock with Stop and Send while recording, "Transcribing…" while the words aren't on
 *  screen yet, the ending's message while it holds, and nothing while the mic warms up or the pill leaves. */
type Beat = 'controls' | 'working' | 'failed' | 'empty' | null;

function beatOf(speechState: SpeechState, ending: VoiceEnding): Beat {
  if (speechState === 'recording') return 'controls';
  if (speechState === 'transcribing') return 'working';
  if (speechState !== 'idle') return null;
  return ending === 'failed' || ending === 'empty' ? ending : null;
}

/** One beat at the line's end; a swap fades the old out before the new comes in. */
function EndBeat({ reduceMotion, children }: { reduceMotion: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="flex items-center gap-2"
      initial={voiceBeatAway('in', reduceMotion)}
      animate={voiceBeatShown}
      exit={{ ...voiceBeatAway('out', reduceMotion), transition: voiceTransition(reduceMotion, 'controlOut') }}
      transition={voiceTransition(reduceMotion, 'controlIn')}
    >
      {children}
    </motion.div>
  );
}

interface EndProps extends Pick<VoicePillProps, 'elapsed' | 'canSend' | 'controlSize' | 'onStop' | 'onSend'> {
  beat: Exclude<Beat, null>;
  /** Finishing needs a "Transcribing…" label: the words aren't on screen yet (recorded, or the live stream dropped). */
  announce: boolean;
}

function EndContent({ beat, announce, elapsed, canSend, controlSize, onStop, onSend }: EndProps) {
  if (beat === 'failed') return <Text variant="figureSmall" tone="danger">{DICTATION_COPY.failed}</Text>;
  if (beat === 'empty') return <Text variant="figureSmall" tone="muted">{DICTATION_COPY.empty}</Text>;
  if (beat === 'working') return announce ? <Text variant="figureSmall" tone="info">{DICTATION_COPY.transcribing}</Text> : null;
  return (
    <>
      <Text variant="figureSmall" tone="muted">{formatClock(elapsed)}</Text>
      <IconButton icon={Square} filled label={DICTATION_COPY.stop} variant="outline" size={controlSize} onClick={onStop} />
      <IconButton icon={ArrowUp} label={DICTATION_COPY.send} variant="primary" size={controlSize} onClick={onSend} disabled={!canSend} />
    </>
  );
}

/** Enter from just below; leave lifted toward the conversation when sent, else settle back down. The ending arrives through
 *  AnimatePresence `custom`, so it's the one in force when the pill leaves. Reduce Motion: fades only. */
function usePillVariants(reduceMotion: boolean) {
  return useMemo(() => ({
    hidden: reduceMotion ? voiceFaded : voicePillCollapsed,
    shown: voicePillSettled,
    leave: (ending: VoiceEnding) => ({
      ...(reduceMotion ? voiceFaded : ending === 'send' ? voicePillLifted : voicePillCollapsed),
      transition: voiceTransition(reduceMotion, 'pillOut'),
    }),
  }), [reduceMotion]);
}

/** The last live words, kept while the pill leaves so they go with it (state set during render: the previous-value pattern). */
function useLastWords(liveText: LiveText | null): LiveText | null {
  const [last, setLast] = useState(liveText);
  if (liveText && liveText !== last) setLast(liveText);
  return liveText ?? last;
}

export const VoicePill: React.FC<VoicePillProps> = ({
  pill, speechState, stream, liveText, elapsed, reduceMotion, canSend, liveLost, backdrop, controlSize, onStop, onSend, onCancel,
}) => {
  const beat = beatOf(speechState, pill.ending);
  const words = useLastWords(liveText);
  const listening = speechState === 'starting' || speechState === 'recording';
  // Cancel: from the mic press until the words are in, on every platform (a phone has no Escape); red, since it discards them.
  const cancellable = speechState !== 'idle';
  const slot = controlSize === 'md' ? 'flex size-control-md shrink-0 items-center justify-center' : 'flex size-control-sm shrink-0 items-center justify-center';
  const variants = usePillVariants(reduceMotion);
  return (
    <motion.div
      data-testid="voice-pill"
      role="region"
      aria-label={pill.label}
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 px-3 pb-1 pt-8"
      variants={variants}
      custom={pill.ending}
      initial="hidden"
      animate="shown"
      exit="leave"
      transition={voiceTransition(reduceMotion, 'pillIn')}
    >
      {backdrop && <Surface variant="veil" aria-hidden data-testid="voice-backdrop" className="absolute inset-0 -z-10" />}
      <LiveTranscript text={words} listening={listening} settled={!listening} liveLost={liveLost} />
      <div className="flex items-center gap-2">
        {/* A fixed slot, so the line never moves as Cancel comes and goes. */}
        <div className={slot}>
          <AnimatePresence initial={false}>
            {cancellable && (
              <EndBeat key="cancel" reduceMotion={reduceMotion}>
                <IconButton icon={X} label={DICTATION_COPY.cancel} variant="dangerTint" size={controlSize} onClick={onCancel} />
              </EndBeat>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <Horizon stage={pill.stage} stream={stream} label={pill.label} />
        </div>
        {/* The composer's control height, so the row never jumps as its end swaps. */}
        <div className={controlSize === 'md' ? 'flex h-control-md shrink-0 items-center' : 'flex h-control-sm shrink-0 items-center'}>
          <AnimatePresence initial={false} mode="wait">
            {beat && (
              <EndBeat key={beat} reduceMotion={reduceMotion}>
                <EndContent
                  beat={beat}
                  announce={words === null || liveLost}
                  elapsed={elapsed}
                  canSend={canSend}
                  controlSize={controlSize}
                  onStop={onStop}
                  onSend={onSend}
                />
              </EndBeat>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
