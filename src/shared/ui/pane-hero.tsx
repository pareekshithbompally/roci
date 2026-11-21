/** A Settings pane's header (macOS System Settings): its glyph large and white on a copper tile, its name, and a line on what
 *  it covers, in a card above its rows. */

import { UI_CONFIG } from '@config/ui.config';
import { Text } from './text';
import { GROUPED_SURFACE } from './recipes';
import { cn } from './utils';
import { ICON_STROKE_WIDTH } from './icon';
import type { TileGlyph } from './icon-tile';

const H = UI_CONFIG.paneHero;

export interface PaneHeroProps {
  icon: TileGlyph;
  title: string;
  description: string;
}

export function PaneHero({ icon: Glyph, title, description }: PaneHeroProps) {
  return (
    <div className={cn(GROUPED_SURFACE, 'flex flex-col items-center gap-2 px-6 py-6 text-center')}>
      <span
        aria-hidden
        className="mb-1 flex shrink-0 items-center justify-center rounded-tile bg-accent-tile text-on-accent shadow-raised"
        style={{ width: H.tile, height: H.tile }}
      >
        <Glyph size={H.glyph} strokeWidth={ICON_STROKE_WIDTH} />
      </span>
      <Text as="h2" variant="pageTitle">{title}</Text>
      <Text as="p" tone="muted">{description}</Text>
    </div>
  );
}
