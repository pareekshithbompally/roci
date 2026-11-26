import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn, dismissKeyboard } from './utils';
import { Surface } from './surface';
import { UI_CONFIG } from '@config/ui.config';
import { commits, inPushedPage, inSidewaysControl, useTouchDrag } from './touch-drag';
import { KIT_COPY } from '@config/kitCopy.config';

export interface RevealLayoutProps {
  open: boolean;
  /** A swipe from the left edge opened it. */
  onOpen: () => void;
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
 * A swipe from the left edge opens it; a swipe back, a tap on the main view or Escape closes it; while open the main view takes no input and focus moves into the pane.
 * The slide is a CSS transition on the `move` spring, so the compositor runs it and nothing on the page can stall it. It
 * has depth: the main view stays whole, a rounded card with its shadow; the sidebar lies under it in shade, which lifts as
 * the view slides off it.
 */
/** The main view follows a sideways drag from anywhere on it 1:1; let go past a share of the pane's width or with a flick
 *  and it opens or closes, otherwise it slides back. Each release carries on from where the finger left it. */
function useRevealDrag(main: HTMLDivElement | null, paneRef: React.RefObject<HTMLElement | null>, shadeRef: React.RefObject<HTMLDivElement | null>, open: boolean, onOpen: () => void, onClose: () => void): void {
  useTouchDrag(main, {
    // From anywhere on the view, not only the edge (a phone's sidebar), except on something that drags sideways itself or a
    // pushed page (its swipe is back), so one swipe never moves two layers.
    axis: 'x',
    ignores: (target) => !main || inSidewaysControl(target, main) || inPushedPage(target),
    onMove: (dx) => {
      const pane = paneRef.current;
      const shade = shadeRef.current;
      if (!main || !pane || !shade) return;
      const width = pane.offsetWidth;
      const at = Math.min(width, Math.max(0, (open ? width : 0) + dx));
      follow(main, shade, at, at / width);
    },
    onEnd: (dx, speed) => {
      const pane = paneRef.current;
      const shade = shadeRef.current;
      if (!main || !pane || !shade) return;
      // The transition takes over from the finger's spot: back on, then the inline pose goes and both carry on.
      settle(main, shade);
      const { edgeShare } = UI_CONFIG.gesture;
      if (open && commits(-dx, -speed, pane.offsetWidth, edgeShare)) onClose();
      else if (!open && commits(dx, speed, pane.offsetWidth, edgeShare)) onOpen();
    },
  });
}

/** Both layers where the finger has them: the main view `at` px aside, the shade over the sidebar lifting by `share` of
 *  the way open. */
function follow(main: HTMLElement, shade: HTMLElement, at: number, share: number): void {
  main.dataset.dragging = '';
  shade.dataset.dragging = '';
  main.style.transform = `translateX(${at}px)`;
  shade.style.opacity = String(1 - share);
}

/** Lets go of both: their transitions carry them on from where the finger left them. */
function settle(main: HTMLElement, shade: HTMLElement): void {
  delete main.dataset.dragging;
  delete shade.dataset.dragging;
  main.style.transform = '';
  shade.style.opacity = '';
}

/** Whether the main view is aside by any amount: open, or still sliding home after closing. Its corners round and its
 *  shadow shows only then; at rest it meets the screen's own rounded corners, so the switch is never seen. */
function useAside(main: HTMLDivElement | null, open: boolean): boolean {
  const [sliding, setSliding] = useState(false);
  useEffect(() => {
    if (open) return setSliding(true);
    if (!main) return;
    const done = (e: TransitionEvent) => { if (e.target === main) setSliding(false); };
    main.addEventListener('transitionend', done);
    return () => main.removeEventListener('transitionend', done);
  }, [main, open]);
  return open || sliding;
}

export function RevealLayout({ open, onOpen, onClose, pane, paneLabel, children }: RevealLayoutProps) {
  const paneRef = useRef<HTMLElement>(null);
  const [main, setMain] = useState<HTMLDivElement | null>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  useRevealDrag(main, paneRef, shadeRef, open, onOpen, onClose);
  const aside = useAside(main, open);

  // Before the first frame of the slide: a field in the main view lets go (its caret would not slide with it).
  useLayoutEffect(() => {
    if (open) dismissKeyboard(paneRef.current);
  }, [open]);

  // Once per opening: the pane itself takes focus (VoiceOver starts there); a first button would show its focus ring
  // on touch. Kept apart from the Escape listener so a re-render never pulls focus back from a field in the pane.
  useEffect(() => {
    if (open) paneRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Surface variant="sidebar" className="relative h-dvh w-full overflow-hidden">
      <nav
        ref={paneRef}
        tabIndex={-1}
        aria-label={paneLabel}
        inert={!open || undefined}
        className="absolute inset-y-0 left-0 flex w-[var(--drawer-start-width)] flex-col pt-safe-top pb-safe-bottom outline-none"
      >
        {pane}
      </nav>
      {/* The sidebar lies under the main view, in its shade; the shade lifts as the view slides off it. */}
      <div
        ref={shadeRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-scrim transition-opacity duration-move ease-move data-[dragging]:transition-none',
          open ? 'opacity-0' : 'opacity-100',
        )}
      />
      <div
        ref={setMain}
        aria-hidden={open || undefined}
        // Only the offset moves (compositor-cheap); corners and shadow switch while it is aside, rather than repainting per frame.
        // clip-path, not only overflow + radius: WebKit leaves composited children (the blurred wash) unclipped by a radius.
        className={cn(
          'absolute inset-0 flex flex-col overflow-hidden transition-transform duration-move ease-move will-change-transform data-[dragging]:transition-none',
          open && 'translate-x-[var(--drawer-start-width)]',
          'data-[dragging]:rounded-sheet data-[dragging]:shadow-overlay data-[dragging]:[clip-path:inset(0_round_var(--radius-sheet))]',
          aside && 'rounded-sheet shadow-overlay [clip-path:inset(0_round_var(--radius-sheet))]',
        )}
      >
        {children}
        {open && <button type="button" aria-label={KIT_COPY.closeNamed(paneLabel)} className="absolute inset-0 z-50 cursor-default" onClick={onClose} />}
      </div>
    </Surface>
  );
}
