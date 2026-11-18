/** An app glyph (Lucide, Simple Icons) as an image URL for a native menu: drawn in black so AppKit can tint it as a template. */

import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MENU_ICON_PT } from '@config/ui.config';

type Glyph = ComponentType<{ size?: number | string; color?: string }>;

const glyphs = new Map<Glyph, string>();

export function menuGlyph(glyph: Glyph): string {
  const known = glyphs.get(glyph);
  if (known) return known;
  const svg = renderToStaticMarkup(createElement(glyph, { size: MENU_ICON_PT * 2, color: '#000' }));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  glyphs.set(glyph, url);
  return url;
}
