/** The app's mark as its icon draws it: the ship's lit port wing and shaded starboard wing (brand tokens), at a kit icon size. */

import { ICON_SIZE_PX, type IconSize } from './icon';
import { MARK_VIEWBOX, MARK_WINGS } from './roci-mark';

export function AppMark({ size = 'md' }: { size?: IconSize }) {
  const px = ICON_SIZE_PX[size];
  return (
    <svg viewBox={MARK_VIEWBOX} width={px} height={px} aria-hidden className="shrink-0">
      <path d={MARK_WINGS.port} style={{ fill: 'var(--brand-ship-light)' }} />
      <path d={MARK_WINGS.starboard} style={{ fill: 'var(--brand-ship-shade)' }} />
    </svg>
  );
}
