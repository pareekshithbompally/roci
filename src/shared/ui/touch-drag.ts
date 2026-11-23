/** The one touch-drag primitive (iOS): a sheet swiped down, a pushed screen swiped back, the sidebar dragged open and
 *  closed. Touch events, not pointer events: the first move is claimed with `preventDefault`, so the drag wins over a
 *  scroll (and the scroll's bounce) instead of being cancelled by it. */

import { useEffect, useRef } from 'react';
import { UI_CONFIG } from '@config/ui.config';

const { edgePx, commitSpeed } = UI_CONFIG.gesture;

/** `down`: only a downward first move takes it. `y`: up or down, a mostly-vertical first move takes it (a half-height sheet,
 *  which a drag up grows). `x`: sideways, a mostly-horizontal first move takes it. */
export type DragAxis = 'down' | 'y' | 'x';

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

/** A move of `moved` px along a travel of `size` px, past `share` of it or faster than a flick, goes all the way. */
export function commits(moved: number, speed: number, size: number, share: number): boolean {
  return moved > size * share || speed > commitSpeed;
}

/** Slides `node` to `translate` on its own CSS transition (iOS curve), then calls `done`. */
export function slideOff(node: HTMLElement, translate: string, done: () => void): void {
  node.addEventListener('transitionend', done, { once: true });
  node.style.translate = translate;
}

const along = (axis: DragAxis, touch: Touch) => (axis === 'x' ? touch.clientX : touch.clientY);

function takes(axis: DragAxis, track: Track, touch: Touch): boolean {
  const dx = touch.clientX - track.x0;
  const dy = touch.clientY - track.y0;
  if (axis === 'x') return Math.abs(dx) > Math.abs(dy);
  if (axis === 'y') return dy !== 0 && Math.abs(dy) >= Math.abs(dx);
  return dy > 0 && dy >= Math.abs(dx);
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
