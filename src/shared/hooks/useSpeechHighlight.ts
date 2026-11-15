/**
 * useSpeechHighlight — marks the text being read aloud inside `root` (a
 * reply's rendered body) with the CSS Custom Highlight API: no markup added,
 * nothing re-rendered. Chunks are found in order; one that can't be found
 * (e.g. text the voice skipped) simply isn't marked.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { findTextRange } from '@shared/utils/textRange';

const { highlight } = READ_ALOUD_CONFIG;

export function useSpeechHighlight(root: RefObject<HTMLElement | null>, spoken: string | null): void {
  /** Where the next chunk is searched from, so repeated sentences highlight in order. */
  const searchFrom = useRef(0);

  useEffect(() => {
    if (!spoken) {
      searchFrom.current = 0;
      return;
    }
    const element = root.current;
    const match = element && findTextRange(element, spoken, searchFrom.current);
    if (!match) return;
    searchFrom.current = match.end;
    CSS.highlights.set(highlight, new Highlight(match.range));
    return () => {
      CSS.highlights.delete(highlight);
    };
  }, [root, spoken]);
}
