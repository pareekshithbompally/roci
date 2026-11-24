import { useEffect, useRef } from 'react';
import { Sheet } from 'react-modal-sheet';
import { UI_CONFIG } from '@config/ui.config';

/** A sheet stop as react-modal-sheet measures it: `snapValueY` is the sheet's offset down from its top stop. */
interface Stop {
  snapIndex: number;
  snapValueY: number;
}

/** The stop a released pull settles at: the nearest to where its speed carries it; never closed while `held`. */
export function settleStop(stops: Stop[], y: number, velocity: number, held: boolean): number | null {
  const landing = y + velocity * UI_CONFIG.sheet.pull.projection;
  const allowed = held ? stops.filter((s) => s.snapIndex !== 0) : stops;
  if (allowed.length === 0) return null;
  return allowed.reduce((best, s) => (Math.abs(s.snapValueY - landing) < Math.abs(best.snapValueY - landing) ? s : best)).snapIndex;
}

/** The element under a touch that scrolls vertically now, inside `root`; null when nothing there scrolls. */
function scrollerUnder(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  }
  return null;
}

interface Pull {
  x: number;
  y: number;
  scroller: HTMLElement | null;
  active: boolean;
  lastY: number;
  lastT: number;
  velocity: number;
}

/**
 * At a sheet's top stop its content always scrolls natively; a pull down from the top of whatever scrolls under the finger
 * (or from content that doesn't scroll) lowers the sheet instead, and the release settles it at a stop or closes it, as
 * UIKit's sheet does. Decided by the finger's first movement: up or sideways is the page's, down at the top is the sheet's.
 * Returns the ref for the sheet's content element.
 */
export function useSheetPullDown(top: number, held: boolean) {
  const sheet = Sheet.useContext();
  const live = useRef(sheet);
  live.current = sheet;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const { slop } = UI_CONFIG.sheet.pull;
    let pull: Pull | null = null;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      pull = live.current.currentSnap === top && e.touches.length === 1
        ? { x: touch.clientX, y: touch.clientY, scroller: scrollerUnder(e.target, root), active: false, lastY: touch.clientY, lastT: e.timeStamp, velocity: 0 }
        : null;
    };

    /** Whether the gesture is the sheet's: down, more than sideways, from the top of what scrolls. */
    const decide = (p: Pull, touch: Touch): boolean | null => {
      const dy = touch.clientY - p.y;
      const dx = touch.clientX - p.x;
      if (Math.abs(dy) < slop && Math.abs(dx) < slop) return null;
      return dy > 0 && Math.abs(dy) > Math.abs(dx) && (!p.scroller || p.scroller.scrollTop <= 0);
    };

    const onMove = (e: TouchEvent) => {
      if (!pull) return;
      const touch = e.touches[0];
      if (!pull.active) {
        const ours = decide(pull, touch);
        if (ours === null) return;
        if (!ours) {
          pull = null;
          return;
        }
        pull.active = true;
        pull.y = touch.clientY;
      }
      e.preventDefault();
      const dt = e.timeStamp - pull.lastT;
      if (dt > 0) pull.velocity = ((touch.clientY - pull.lastY) / dt) * 1000;
      pull.lastY = touch.clientY;
      pull.lastT = e.timeStamp;
      live.current.y.set(Math.max(touch.clientY - pull.y, 0));
    };

    const onEnd = () => {
      const released = pull;
      pull = null;
      if (!released?.active) return;
      const { y, snapPoints, snapTo } = live.current;
      const stop = settleStop(snapPoints, y.get(), released.velocity, held);
      if (stop !== null) snapTo(stop);
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [top, held]);

  return ref;
}
