/** Marks the chunk being read aloud via the CSS Custom Highlight API; chunks that cannot be found stay unmarked. */

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
