// Roci's mark (the two-wing ship, as on the splash in index.html): one drawing, two renderings — `RociMark`, a Lucide
// glyph filled in the current colour, and `AppMark`, the app icon's two-tone ship.
import { createLucideIcon } from 'lucide-react';

/** The ship's wings on an 18-unit square: port (left, lit in the app icon) and starboard (right, shaded). */
export const MARK_VIEWBOX = '0 0 18 18';
export const MARK_WINGS = {
  port: 'M8.33 2.38 Q8.54 1.93 8.54 2.43 L8.54 12.80 Q8.54 13.20 8.19 13.38 L2.13 16.40 Q1.32 16.80 1.71 15.99 Z',
  starboard: 'M9.46 2.43 Q9.46 1.93 9.67 2.38 L16.29 15.99 Q16.68 16.80 15.87 16.40 L9.81 13.38 Q9.46 13.20 9.46 12.80 Z',
} as const;

/** The 18-unit drawing on Lucide's 24-unit grid. */
const MARK_SCALE = 'scale(1.3333)';

export const RociMark = createLucideIcon('RociMark', (Object.keys(MARK_WINGS) as Array<keyof typeof MARK_WINGS>).map((wing) => [
  'path',
  { key: wing, d: MARK_WINGS[wing], fill: 'currentColor', stroke: 'none', transform: MARK_SCALE },
]));
