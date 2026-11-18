// Roci's mark (the two-wing ship, as on the splash in index.html) as a Lucide icon, so `Icon` and `IconButton` take it like
// any glyph: filled in the current colour, its 18-unit drawing scaled onto Lucide's 24-unit grid.
import { createLucideIcon } from 'lucide-react';

const MARK_SCALE = 'scale(1.3333)';

export const RociMark = createLucideIcon('RociMark', [
  ['path', {
    key: 'port',
    d: 'M8.33 2.38 Q8.54 1.93 8.54 2.43 L8.54 12.80 Q8.54 13.20 8.19 13.38 L2.13 16.40 Q1.32 16.80 1.71 15.99 Z',
    fill: 'currentColor',
    stroke: 'none',
    transform: MARK_SCALE,
  }],
  ['path', {
    key: 'starboard',
    d: 'M9.46 2.43 Q9.46 1.93 9.67 2.38 L16.29 15.99 Q16.68 16.80 15.87 16.40 L9.81 13.38 Q9.46 13.20 9.46 12.80 Z',
    fill: 'currentColor',
    stroke: 'none',
    transform: MARK_SCALE,
  }],
]);
