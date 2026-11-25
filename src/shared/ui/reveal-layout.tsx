import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { dismissKeyboard } from './utils';
import { motionFor } from './motion';
import { Surface } from './surface';
import { UI_CONFIG } from '@config/ui.config';
import { commits, inPushedPage, inSidewaysControl, releaseMotion, useTouchDrag } from './touch-drag';
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
 */
/** The main view's offset (px): it follows a sideways drag from anywhere on it, and springs to its side when `open` changes
 *  or a drag is let go — after a drag on the kit's release motion from the finger's speed, after a tap on the `move` spring. Let go past a share of the pane's width or with a flick and it opens or closes, else it springs back. */
function useRevealOffset(main: HTMLDivElement | null, paneRef: React.RefObject<HTMLElement | null>, open: boolean, onOpen: () => void, onClose: () => void): MotionValue<number> {
  const x = useMotionValue(0);
  const reduce = useReducedMotion() ?? false;
  /** The finger's speed at its last release (px per ms); null once a tap moves it. */
  const released = useRef<number | null>(null);
  const width = useCallback(() => paneRef.current?.offsetWidth ?? 0, [paneRef]);
  const settle = useCallback(() => {
    const speed = released.current;
    released.current = null;
    return animate(x, open ? width() : 0, speed === null ? motionFor('move', reduce) : releaseMotion(speed, reduce));
  }, [x, open, width, reduce]);

  useEffect(() => {
    const controls = settle();
    return () => controls.stop();
  }, [settle]);

  // A rotation or a resized window moves the pane's edge: the view goes straight to it.
  useEffect(() => {
    const onResize = () => x.jump(open ? width() : 0);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [x, open, width]);

  useTouchDrag(main, {
    // From anywhere on the view, not only the edge (a phone's sidebar), except on something that drags sideways itself or a
    // pushed page (its swipe is back), so one swipe never moves two layers.
    axis: 'x',
    ignores: (target) => !main || inSidewaysControl(target, main) || inPushedPage(target),
    // The finger takes over from any spring still settling it.
    onMove: (dx) => {
      x.stop();
      x.set(Math.min(width(), Math.max(0, (open ? width() : 0) + dx)));
    },
    onEnd: (dx, speed) => {
      const { edgeShare } = UI_CONFIG.gesture;
      released.current = speed;
      if (open && commits(-dx, -speed, width(), edgeShare)) onClose();
      else if (!open && commits(dx, speed, width(), edgeShare)) onOpen();
      else settle();
    },
  });
  return x;
}

/** Marks the main view while it is aside (by any amount): its corners round and its shadow shows. At rest the view meets the
 *  screen's own rounded corners, so the switch is never seen. */
function useAsideMark(main: HTMLDivElement | null, x: MotionValue<number>): void {
  useMotionValueEvent(x, 'change', (v) => main?.toggleAttribute('data-aside', v > 0));
}

export function RevealLayout({ open, onOpen, onClose, pane, paneLabel, children }: RevealLayoutProps) {
  const paneRef = useRef<HTMLElement>(null);
  const [main, setMain] = useState<HTMLDivElement | null>(null);
  const x = useRevealOffset(main, paneRef, open, onOpen, onClose);
  useAsideMark(main, x);

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
      <motion.div
        ref={setMain}
        aria-hidden={open || undefined}
        style={{ x }}
        // Only the offset moves (compositor-cheap); corners and shadow switch while it is aside, rather than repainting per frame.
        // clip-path, not only overflow + radius: WebKit leaves composited children (the blurred wash) unclipped by a radius.
        className="absolute inset-0 flex flex-col overflow-hidden will-change-transform data-[aside]:rounded-sheet data-[aside]:shadow-overlay data-[aside]:[clip-path:inset(0_round_var(--radius-sheet))]"
      >
        {children}
        {open && <button type="button" aria-label={KIT_COPY.closeNamed(paneLabel)} className="absolute inset-0 z-50 cursor-default" onClick={onClose} />}
      </motion.div>
    </Surface>
  );
}
