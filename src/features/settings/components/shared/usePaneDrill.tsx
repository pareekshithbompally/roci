/** A Settings pane's drill-in, one way for every pane: on iPhone a page is pushed onto the Settings stack; on Mac and iPad it
 *  replaces the pane's list (back in its toolbar), and › returns to the page last left until another page opens. */

import type React from 'react';
import { useCallback, useState } from 'react';
import { useOptionalNavStack } from '@shared/ui';

export interface DrillPage {
  title: string;
  /** The page, given `close`: back to the list on Mac and iPad, off the stack on iPhone. */
  render: (close: () => void) => React.ReactNode;
}

interface DrillState {
  open: DrillPage | null;
  left: DrillPage | null;
}

export interface PaneDrill {
  /** The open page on Mac and iPad, shown in place of the list; always null on iPhone. */
  view: React.ReactNode;
  open: (page: DrillPage) => void;
  /** Back into the page last left (Mac, iPad), for the list's toolbar. */
  forward?: () => void;
}

/** `initial`: a page to open on arrival (Mac, iPad), e.g. a provider a deep link names. */
export function usePaneDrill(initial: DrillPage | null = null): PaneDrill {
  const stack = useOptionalNavStack();
  const [{ open, left }, setState] = useState<DrillState>({ open: stack ? null : initial, left: null });

  const openPage = useCallback((page: DrillPage) => {
    if (!stack) {
      setState({ open: page, left: null });
      return;
    }
    let id = -1;
    id = stack.push({ title: page.title, content: page.render(() => stack.remove(id)) });
  }, [stack]);

  return {
    view: open ? open.render(() => setState({ open: null, left: open })) : null,
    open: openPage,
    forward: left ? () => setState({ open: left, left: null }) : undefined,
  };
}
