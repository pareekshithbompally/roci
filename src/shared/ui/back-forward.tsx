/** The macOS 26 toolbar's back / forward capsule (System Settings, Finder): one pill, ‹ and › split by a hairline; a
 *  direction with nowhere to go is dimmed. Toolbar-sized (28px controls), filled like the system's toolbar controls, no lift.
 *  ⌘[ and ⌘] go back and forward while it shows, not while a sheet is open over the page (as on macOS). */

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './button';
import { Separator } from './surface';
import { KIT_COPY } from '@config/kitCopy.config';

export interface BackForwardProps {
  /** Goes back; none dims ‹. */
  onBack?: () => void;
  /** Goes forward again after going back; none dims ›. */
  onForward?: () => void;
}

const SHORTCUTS = { '[': 'back', ']': 'forward' } as const;
/** A sheet or alert open over the page. */
const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

export function BackForward({ onBack, onForward }: BackForwardProps) {
  useEffect(() => {
    const go = { back: onBack, forward: onForward };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = event.metaKey && !event.shiftKey ? SHORTCUTS[event.key as keyof typeof SHORTCUTS] : undefined;
      const action = direction && go[direction];
      if (!action || document.querySelector(OPEN_DIALOG)) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack, onForward]);

  return (
    <div role="group" aria-label={KIT_COPY.navigation} className="inline-flex shrink-0 items-center rounded-full bg-control px-0.5">
      <IconButton icon={ChevronLeft} label={KIT_COPY.back} size="sm" disabled={!onBack} onClick={onBack} />
      <Separator orientation="vertical" className="my-1.5" />
      <IconButton icon={ChevronRight} label={KIT_COPY.forward} size="sm" disabled={!onForward} onClick={onForward} />
    </div>
  );
}
