/** Live dictation words above the line: a few lines at most, the newest at the bottom, the oldest fading out at the top. Scroll
 *  back to reread and they hold; left still a moment, they follow the newest words again. */

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { HORIZON_CONFIG } from '@config/horizon.config';
import { DICTATION_COPY } from '@config/chat.config';
import { FadeScroll, Text } from '@shared/ui';
import type { LiveText } from '@services/ai/transcription';

const { lines, placeholder, resumeMs, slackPx } = HORIZON_CONFIG.composer.liveText;
/** At most `lines` lines of the spoken style (tokens.css `--lh-spoken`). */
const MAX_HEIGHT = { maxHeight: `calc(var(--lh-spoken) * ${lines})` };

interface LiveTranscriptProps {
  /** The words so far; null when dictation isn't live. */
  text: LiveText | null;
  /** Still listening: an empty line shows the placeholder. */
  listening: boolean;
  /** Capture has ended: words still settling show firm, since nothing more is coming. */
  settled: boolean;
  /** The live stream dropped: the words so far stay, with a note that the recording will be transcribed instead. */
  liveLost: boolean;
}

/** Follows the newest words unless the reader scrolled back; one timer, re-armed by each scroll, hands them back. */
function useFollowNewest(text: LiveText | null, liveLost: boolean) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const resume = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the newest words in view while following; the fade at the top shows there's more above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [text, liveLost]);
  useEffect(() => () => clearTimeout(resume.current), []);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    clearTimeout(resume.current);
    following.current = scrollHeight - scrollTop - clientHeight <= slackPx;
    if (following.current) return;
    resume.current = setTimeout(() => {
      following.current = true;
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    }, resumeMs);
  };
  return { scroller, onScroll };
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({ text, listening, settled, liveLost }) => {
  const { scroller, onScroll } = useFollowNewest(text, liveLost);

  const empty = !text?.committed && !text?.tentative;
  if (empty && !listening) return null;
  return (
    <FadeScroll ref={scroller} onScroll={onScroll} className="w-full px-1" style={MAX_HEIGHT}>
      <Text as="p" variant="spoken" aria-live="polite">
        {empty ? (
          <Text variant="inherit" tone="faint">{placeholder}</Text>
        ) : (
          <>
            {text?.committed}
            <Text variant="inherit" tone={settled ? 'inherit' : 'faint'}>{text?.tentative}</Text>
          </>
        )}
      </Text>
      {liveLost && <Text as="p" variant="helper" tone="faint">{DICTATION_COPY.liveLost}</Text>}
    </FadeScroll>
  );
};
