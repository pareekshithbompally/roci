import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { LIST_ART_PX, LIST_ART_RADIUS } from '@shared/ui';
import { AppIcon, GlyphTile } from '@shared/components';

interface IntegrationIconProps {
  /** A Mac app's bundle id: its own icon from macOS. */
  app?: string;
  /** A full-bleed square image (an app icon or brand square) for integrations without an app on this Mac. */
  src?: string;
  /** A bare glyph image (Apple Intelligence): shown on a white tile. */
  glyph?: string;
  /** Line glyph when the app's icon can't be read (iPhone). */
  symbol?: LucideIcon;
}

/** An integration's icon at list-art size, so app icons, images and glyphs match the Settings sidebar's pane icons. */
export const IntegrationIcon: React.FC<IntegrationIconProps> = ({ app, src, glyph, symbol }) => {
  if (app) return <AppIcon app={app} size="tile" fallback={src} symbol={symbol} />;
  if (glyph) return <GlyphTile src={glyph} size="row" />;
  return (
    <span className="shrink-0 overflow-hidden" style={{ width: LIST_ART_PX, height: LIST_ART_PX, borderRadius: LIST_ART_RADIUS }}>
      <img src={src} alt="" className="w-full h-full" />
    </span>
  );
};
