import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn, dismissKeyboard } from './utils';
import { Surface } from './surface';
import { UI_CONFIG } from '@config/ui.config';
import { commits, inPushedPage, inSidewaysControl, useTouchDrag } from './touch-drag';
import { KIT_COPY } from '@config/kitCopy.config';
import { MOTION } from '@config/motion.config';

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
 * has depth: the main view stays whole, a rounded card with its shadow, and only slides; the sidebar lies under it a little
 * smaller and faded, and zooms forward to full size as the view slides off it (motion.config.ts `depth`).
 */
/** The main view follows a sideways drag from anywhere on it 1:1; let go past a share of the pane's width or with a flick
 *  and it opens or closes, otherwise it slides back. Each release carries on from where the finger left it. */
function useRevealDrag(main: HTMLDivElement | null, paneRef: React.RefObject<HTMLElement | null>, open: boolean, onOpen: () => void, onClose: () => void): void {
  useTouchDrag(main, {
    // From anywhere on the view, not only the edge (a phone's sidebar), except on something that drags sideways itself or a
    // pushed page (its swipe is back), so one swipe never moves two layers.
    axis: 'x',
    ignores: (target) => !main || inSidewaysControl(target, main) || inPushedPage(target),
    onMove: (dx) => {
      const pane = paneRef.current;
      if (!main || !pane) return;
      const width = pane.offsetWidth;
      const at = Math.min(width, Math.max(0, (open ? width : 0) + dx));
      follow(main, pane, at, at / width);
    },
    onEnd: (dx, speed) => {
      const pane = paneRef.current;
      if (!main || !pane) return;
      // The transition takes over from the finger's spot: back on, then the inline pose goes and both carry on.
      settle(main, pane);
      const { edgeShare } = UI_CONFIG.gesture;
      if (open && commits(-dx, -speed, pane.offsetWidth, edgeShare)) onClose();
      else if (!open && commits(dx, speed, pane.offsetWidth, edgeShare)) onOpen();
    },
  });
}

const between = (from: number, to: number, share: number) => from + (to - from) * share;

/** Both layers where the finger has them: the main view `at` px aside, the sidebar `share` of the way forward. */
function follow(main: HTMLElement, pane: HTMLElement, at: number, share: number): void {
  const { pane: from, paneDim } = MOTION.depth;
  main.dataset.dragging = '';
  main.dataset.moving = '';
  pane.dataset.dragging = '';
  main.style.transform = `translateX(${at}px)`;
  pane.style.transform = `scale(${between(from, 1, share)})`;
  pane.style.opacity = String(between(paneDim, 1, share));
}

/** Lets go of both: their transitions carry them on from where the finger left them; with nothing left to move, the main
 *  view is at rest at once. */
function settle(main: HTMLElement, pane: HTMLElement): void {
  delete main.dataset.dragging;
  delete pane.dataset.dragging;
  main.style.transform = '';
  pane.style.transform = '';
  pane.style.opacity = '';
  requestAnimationFrame(() => {
    if (main.getAnimations().length === 0) delete main.dataset.moving;
  });
}

/** Marks the main view `data-moving` from the moment it starts to slide until it rests: blurs inside it switch off for the
 *  slide (glass.css), since a moving blur is redrawn every frame. Set straight on the element, never through React state,
 *  so the slide's first frame waits on nothing. */
function useMovingMark(main: HTMLDivElement | null, open: boolean): void {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (main) main.dataset.moving = '';
  }, [main, open]);
  useEffect(() => {
    if (!main) return;
    const rest = (e: TransitionEvent) => {
      if (e.target === main) delete main.dataset.moving;
    };
    main.addEventListener('transitionend', rest);
    main.addEventListener('transitioncancel', rest);
    return () => {
      main.removeEventListener('transitionend', rest);
      main.removeEventListener('transitioncancel', rest);
    };
  }, [main]);
}

export function RevealLayout({ open, onOpen, onClose, pane, paneLabel, children }: RevealLayoutProps) {
  const paneRef = useRef<HTMLElement>(null);
  const [main, setMain] = useState<HTMLDivElement | null>(null);
  useRevealDrag(main, paneRef, open, onOpen, onClose);
  useMovingMark(main, open);

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
        // Underneath the main view, a little smaller and faded; it comes forward to full size as the view slides off it.
        className={cn(
          'absolute inset-y-0 left-0 flex w-[var(--drawer-start-width)] origin-left flex-col pt-safe-top pb-safe-bottom outline-none',
          'transition-[transform,opacity] duration-move ease-move will-change-transform data-[dragging]:transition-none',
          !open && 'scale-pane opacity-pane',
        )}
      >
        {pane}
      </nav>
      {/* The main view: always the rounded card with its shadow (its corners sit inside the screen's own, so at rest they
          never show), so starting to slide changes nothing but its offset. The outer layer moves and casts the shadow; the
          inner one clips (clip-path, not only a radius: WebKit leaves composited children unclipped by a radius). */}
      <div
        ref={setMain}
        aria-hidden={open || undefined}
        className={cn(
          'absolute inset-0 rounded-sheet shadow-overlay transition-transform duration-move ease-move will-change-transform data-[dragging]:transition-none',
          open && 'translate-x-[var(--drawer-start-width)]',
        )}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-sheet [clip-path:inset(0_round_var(--radius-sheet))]">{children}</div>
        {open && <button type="button" aria-label={KIT_COPY.closeNamed(paneLabel)} className="absolute inset-0 z-50 cursor-default" onClick={onClose} />}
      </div>
    </Surface>
  );
}
