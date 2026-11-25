/** The one sideways touch-drag primitive (iOS): a pushed screen swiped back, the sidebar dragged open and closed (sheets
 *  move through react-modal-sheet, bottom-sheet.tsx); `release` lets go of one. Touch events, not pointer events: the first move is claimed with `preventDefault`, so the drag wins over a
 *  scroll (and the scroll's bounce) instead of being cancelled by it. */

import { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';
import type { AnimationPlaybackControls, Transition } from 'framer-motion';
import { UI_CONFIG } from '@config/ui.config';
import { motionFor, spring } from './motion';

const MS_PER_S = 1000;

const { edgePx, commitSpeed } = UI_CONFIG.gesture;

/** `x`: sideways — a mostly-horizontal first move takes it. */
export type DragAxis = 'x';

export interface TouchDrag {
  axis: DragAxis;
  /** Only touches starting within `edgePx` of the screen's left edge (swipe back, opening the sidebar). */
  edgeOnly?: boolean;
  /** A touch landing here is left alone (a scrolled list, a slider). */
  ignores?: (target: Element) => boolean;
  /** The finger moved `delta` px along the axis since it landed. */
  onMove: (delta: number) => void;
  /** The finger lifted at `delta`, moving at `speed` px per ms along the axis. */
  onEnd: (delta: number, speed: number) => void;
}

interface Track {
  x0: number;
  y0: number;
  /** Where the finger landed, along the axis. */
  origin: number;
  /** Decided on the first move: the drag takes the touch, or a scroll does. */
  taken?: boolean;
  last: number;
  lastT: number;
  speed: number;
}

/** The touch landed on something that drags sideways itself (a wide table, code or equation that scrolls, a slider), so a
 *  sideways gesture belongs to it, not to a screen-wide drag. */
export function inSidewaysControl(target: Element, within: Element): boolean {
  if (target.closest('input[type="range"]')) return true;
  for (let el: Element | null = target; el && within.contains(el); el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/** Marks a pushed page: a sideways swipe on it is its own (back), never a screen-wide drag's (the sidebar's). */
export const PUSHED_PAGE_MARK = { 'data-pushed-page': '' } as const;
export const inPushedPage = (target: Element): boolean => target.closest('[data-pushed-page]') !== null;

/** A move of `moved` px along a travel of `size` px, past `share` of it or faster than a flick, goes all the way. */
export function commits(moved: number, speed: number, size: number, share: number): boolean {
  return moved > size * share || speed > commitSpeed;
}

/** How anything a finger lets go of moves on: the `follow` spring, starting at the finger's `speed` (px per ms), so the move
 *  carries on from the finger instead of restarting. */
export function releaseMotion(speed: number, reduce: boolean): Transition {
  return reduce ? motionFor('follow', true) : spring('follow', speed * MS_PER_S);
}

/** Lets go of `node`, dragged sideways to `from` px: it springs on to `to` px (`releaseMotion`), then `done` runs. Returns
 *  the move, so a new drag can stop a spring-back still under way instead of fighting it. */
export function release(node: HTMLElement, from: number, to: number, speed: number, reduce: boolean, done?: () => void): AnimationPlaybackControls {
  const controls = animate(node, { x: [from, to] }, releaseMotion(speed, reduce));
  controls.finished
    .then(() => done?.())
    .catch((error: unknown) => console.error('[touchDrag] release failed:', error));
  return controls;
}

const along = (_axis: DragAxis, touch: Touch) => touch.clientX;

function takes(axis: DragAxis, track: Track, touch: Touch): boolean {
  const dx = touch.clientX - track.x0;
  const dy = touch.clientY - track.y0;
  return axis === 'x' && Math.abs(dx) > Math.abs(dy);
}

function starts(drag: TouchDrag, e: TouchEvent): boolean {
  const touch = e.touches[0];
  if (e.touches.length !== 1 || !(e.target instanceof Element)) return false;
  if (drag.edgeOnly && touch.clientX > edgePx) return false;
  return !drag.ignores?.(e.target);
}

function follow(drag: TouchDrag, track: Track, e: TouchEvent): void {
  const touch = e.touches[0];
  track.taken ??= takes(drag.axis, track, touch);
  if (!track.taken) return;
  e.preventDefault();
  const now = performance.now();
  const at = along(drag.axis, touch);
  track.speed = (at - track.last) / Math.max(1, now - track.lastT);
  track.last = at;
  track.lastT = now;
  drag.onMove(at - track.origin);
}

/** Calls `drag` as a finger drags across `el`. */
export function useTouchDrag(el: HTMLElement | null, drag: TouchDrag): void {
  const latest = useRef(drag);
  latest.current = drag;

  useEffect(() => {
    if (!el) return;
    let track: Track | null = null;
    const start = (e: TouchEvent) => {
      const touch = e.touches[0];
      const origin = along(latest.current.axis, touch);
      track = starts(latest.current, e)
        ? { x0: touch.clientX, y0: touch.clientY, origin, last: origin, lastT: performance.now(), speed: 0 }
        : null;
    };
    const move = (e: TouchEvent) => {
      if (track) follow(latest.current, track, e);
    };
    const end = () => {
      if (track?.taken) latest.current.onEnd(track.last - track.origin, track.speed);
      track = null;
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [el]);
}
