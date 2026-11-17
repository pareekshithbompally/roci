import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { cn, dismissKeyboard } from './utils';
import { Surface } from './surface';

export interface RevealLayoutProps {
  open: boolean;
  onClose: () => void;
  /** The pane revealed at the start edge (the sidebar). */
  pane: React.ReactNode;
  /** The pane's name (VoiceOver). */
  paneLabel: string;
  /** The main view. */
  children: React.ReactNode;
}

/**
 * iOS sidebar: the main view slides aside — still in view, with rounded corners — to reveal the pane beneath it.
 * A tap on the main view or Escape closes it; while open the main view takes no input and focus moves into the pane.
 */
export function RevealLayout({ open, onClose, pane, paneLabel, children }: RevealLayoutProps) {
  const paneRef = useRef<HTMLElement>(null);

  // Before the first frame of the slide: a field in the main view lets go (its caret would not slide with it).
  useLayoutEffect(() => {
    if (open) dismissKeyboard(paneRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    paneRef.current?.querySelector<HTMLElement>('button, a[href], input')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Surface variant="page" className="relative h-screen w-full overflow-hidden">
      <nav
        ref={paneRef}
        aria-label={paneLabel}
        inert={!open || undefined}
        className="absolute inset-y-0 left-0 flex w-[var(--drawer-start-width)] flex-col pt-safe-top pb-safe-bottom"
      >
        {pane}
      </nav>
      <div
        aria-hidden={open || undefined}
        // Only the slide animates (compositor-cheap); corners and shadow switch with it rather than repainting per frame.
        className={cn(
          'absolute inset-0 flex flex-col overflow-hidden transition-transform duration-ios ease-ios will-change-transform',
          open && 'translate-x-[var(--drawer-start-width)] rounded-sheet shadow-overlay',
        )}
      >
        {children}
        {open && <button type="button" aria-label={`Close ${paneLabel}`} className="absolute inset-0 z-50 cursor-default" onClick={onClose} />}
      </div>
    </Surface>
  );
}
