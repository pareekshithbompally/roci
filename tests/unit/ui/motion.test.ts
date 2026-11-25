/** CSS animations move on framer-motion's own springs (tailwind.config.js), so CSS and JS motion never drift apart. */

import { describe, it, expect } from 'vitest';
import { spring as springCurve } from 'framer-motion';
import { MOTION } from '@config/motion.config';
import tailwind from '@/tailwind.config.js';

/** `<duration>ms linear(p0, p1, …)` → duration and evenly spaced points. */
function parseSpringCss(css: string): { duration: number; points: number[] } {
  const [, ms, list] = css.match(/^(\d+)ms linear\((.*)\)/) ?? [];
  return { duration: Number(ms), points: list.split(',').map((p) => parseFloat(p)) };
}

describe('CSS moves on the same springs (tailwind.config.js)', () => {
  const animation = tailwind.theme.extend.animation as Record<string, string>;

  it.each([
    ['push-in', MOTION.spring.move],
    ['menu-pop-show', MOTION.spring.pop],
  ] as const)('%s follows framer’s spring within 1%% and ends exactly at its end', (name, spec) => {
    const { duration, points } = parseSpringCss(animation[name].replace(`${name} `, ''));
    const curve = springCurve({ keyframes: [0, 1], ...spec });
    const end = curve.next(duration).value;
    points.forEach((p, i) => {
      const t = (i / (points.length - 1)) * duration;
      expect(Math.abs(p - curve.next(t).value / end)).toBeLessThan(0.01);
    });
    expect(points.at(-1)).toBeCloseTo(1, 3);
  });

  it('an exit off-screen ends sooner than an entrance (its settling tail is off-screen)', () => {
    const enter = parseSpringCss(animation['push-in'].replace('push-in ', '')).duration;
    const exit = parseSpringCss(animation['push-out'].replace('push-out ', '')).duration;
    expect(exit).toBeLessThan(enter);
  });
});
