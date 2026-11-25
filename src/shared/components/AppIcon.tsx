/** A Mac app's own icon (Finder, Calendar, …) from macOS, by bundle id; else `fallback`, else `symbol` as a line glyph (iPhone). */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { Icon, IconTile, ICON_SIZE_PX, LIST_ART_PX, type IconSize } from '@shared/ui';
import { platform } from '@platform/index';
import { UI_CONFIG } from '@config/ui.config';


interface AppIconProps {
  /** Bundle id, e.g. `com.apple.finder`. */
  app: string;
  size: AppIconSize;
  /** Image shown when the app isn't on this Mac (or outside the desktop app). */
  fallback?: string;
  /** Line glyph when there is no image: always on iPhone, which can't read other apps' icons. */
  symbol?: LucideIcon;
}

/** Icons never change while the app runs: fetched once per bundle id. */
export function useAppIcon(app: string | undefined): string | null {
  const { data } = useQuery({
    queryKey: queryKeys.appIcon(app ?? ''),
    queryFn: () => invoke<string | null>('app_icon', { app }),
    enabled: isTauriEnvironment() && platform.canReadAppIcons && !!app,
    staleTime: Infinity,
  });
  return data ?? null;
}

/** A kit icon size, or `tile`: a settings row, where the icon's visible body is list-art size (like the Settings pane icons). */
type AppIconSize = IconSize | 'tile';

/** A row tile: macOS's own icon, else a logo tile; an empty slot when neither. */
const TileImage: React.FC<{ src?: string | null; system: boolean }> = ({ src, system }) => {
  if (!src) return <span aria-hidden className="shrink-0 inline-block" style={{ width: LIST_ART_PX, height: LIST_ART_PX }} />;
  return system ? <IconTile app={src} /> : <IconTile logo={src} />;
};

/** An app's icon image at a kit icon size; an empty slot of the same size when there is none, so rows line up. `bare`:
 *  art with no padding of its own, drawn at an app icon's visible size so it matches the system icons beside it. */
export const AppImage: React.FC<{ src?: string | null; size: AppIconSize; bare?: boolean }> = ({ src, size, bare }) => {
  if (size === 'tile') return <TileImage src={src} system={!bare} />;
  const px = ICON_SIZE_PX[size];
  if (!src) return <span aria-hidden className="shrink-0 inline-block" style={{ width: px, height: px }} />;
  const drawn = bare ? Math.round(px * UI_CONFIG.appIconBody) : px;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center" style={{ width: px, height: px }}>
      <img src={src} alt="" width={drawn} height={drawn} className="shrink-0" />
    </span>
  );
};

export const AppIcon: React.FC<AppIconProps> = ({ app, size, fallback, symbol }) => {
  const icon = useAppIcon(app);
  const src = icon ?? fallback;
  if (src || !symbol) return <AppImage src={src} size={size} bare={!icon} />;
  return size === 'tile' ? <IconTile icon={symbol} /> : <Icon icon={symbol} size={size} />;
};
