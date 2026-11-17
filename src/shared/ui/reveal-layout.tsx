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
    // The pane itself takes focus (VoiceOver starts there); a first button would show its focus ring on touch.
    paneRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Surface variant="page" className="relative h-screen w-full overflow-hidden">
      <nav
        ref={paneRef}
        tabIndex={-1}
        aria-label={paneLabel}
        inert={!open || undefined}
        className="absolute inset-y-0 left-0 flex w-[var(--drawer-start-width)] flex-col pt-safe-top pb-safe-bottom outline-none"
      >
        {pane}
      </nav>
      <div
        aria-hidden={open || undefined}
        // Only the slide animates (compositor-cheap); corners and shadow switch with it rather than repainting per frame.
        className={cn(
          'absolute inset-0 flex flex-col overflow-hidden transition-transform duration-ios ease-ios will-change-transform',
          // clip-path, not only overflow + radius: WebKit leaves composited children (the blurred wash) unclipped by a radius.
          open && 'translate-x-[var(--drawer-start-width)] rounded-sheet shadow-overlay [clip-path:inset(0_round_var(--radius-sheet))]',
        )}
      >
        {children}
        {open && <button type="button" aria-label={`Close ${paneLabel}`} className="absolute inset-0 z-50 cursor-default" onClick={onClose} />}
      </div>
    </Surface>
  );
}
