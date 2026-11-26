/** iPhone: whether the keyboard is down and the page has finished riding it, so something can appear where it will stay
 *  (dictation's line in the composer) instead of riding down with it. The native view writes the keyboard's height into
 *  `--keyboard-inset` as the keyboard moves (RociWebView.swift); tokens.css eases the page after it over `MOTION.keyboard`.
 *  Event-driven: the native view's style write, then one timer for that ride. Always true without an on-screen keyboard. */

import { useEffect, useState } from 'react';
import { platform } from '@platform/index';
import { MOTION } from '@config/motion.config';

const MS_PER_S = 1000;
const inset = () => parseFloat(document.documentElement.style.getPropertyValue('--keyboard-inset')) || 0;

export function useKeyboardSettled(): boolean {
  const [settled, setSettled] = useState(() => !platform.hasTouchScreen || inset() === 0);
  useEffect(() => {
    if (!platform.hasTouchScreen) return;
    let ride: ReturnType<typeof setTimeout> | undefined;
    let last = inset();
    const observer = new MutationObserver(() => {
      const now = inset();
      if (now === last) return;
      last = now;
      clearTimeout(ride);
      if (now > 0) setSettled(false);
      else ride = setTimeout(() => setSettled(true), MOTION.keyboard * MS_PER_S);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      observer.disconnect();
      clearTimeout(ride);
    };
  }, []);
  return settled;
}
