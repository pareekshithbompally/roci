import React from 'react';
import { ICON_TILE_PX, ICON_TILE_RADIUS } from '@shared/ui';
import { AppIcon, GlyphTile } from '@shared/components';

interface IntegrationIconProps {
  /** A Mac app's bundle id: its own icon from macOS. */
  app?: string;
  /** A full-bleed square image (an app icon or brand square) for integrations without an app on this Mac. */
  src?: string;
  /** A bare glyph image (Apple Intelligence): shown on a white tile. */
  glyph?: string;
}

/** An integration's icon at icon-tile size, so app icons, images and glyphs weigh the same as the tiles in other panels. */
export const IntegrationIcon: React.FC<IntegrationIconProps> = ({ app, src, glyph }) => {
  if (app) return <AppIcon app={app} size="tile" fallback={src} />;
  if (glyph) return <GlyphTile src={glyph} size="row" />;
  return (
    <span className="shrink-0 overflow-hidden" style={{ width: ICON_TILE_PX, height: ICON_TILE_PX, borderRadius: ICON_TILE_RADIUS }}>
      <img src={src} alt="" className="w-full h-full" />
    </span>
  );
};
