/** A Mac app's own icon (Finder, Calendar, …) from macOS, by bundle id; `fallback` when the app isn't installed. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { ICON_SIZE_PX, ICON_TILE_PX, type IconSize } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';


interface AppIconProps {
  /** Bundle id, e.g. `com.apple.finder`. */
  app: string;
  size: AppIconSize;
  /** Image shown when the app isn't on this Mac (or outside the desktop app). */
  fallback?: string;
}

/** Icons never change while the app runs: fetched once per bundle id. */
export function useAppIcon(app: string): string | null {
  const { data } = useQuery({
    queryKey: queryKeys.appIcon(app),
    queryFn: () => invoke<string | null>('app_icon', { app }),
    enabled: isTauriEnvironment(),
    staleTime: Infinity,
  });
  return data ?? null;
}

/** A kit icon size, or `tile`: a settings row, where the icon's visible body matches an icon tile. */
type AppIconSize = IconSize | 'tile';

/** macOS draws an app icon's body inside padding, so at tile size the image is scaled up and overflows its tile-sized box evenly. */
const TILE_IMAGE_PX = Math.round(ICON_TILE_PX / UI_CONFIG.appIconBody);

const TileImage: React.FC<{ src?: string | null }> = ({ src }) => (
  <span aria-hidden className="inline-flex shrink-0 items-center justify-center" style={{ width: ICON_TILE_PX, height: ICON_TILE_PX }}>
    {src && <img src={src} alt="" width={TILE_IMAGE_PX} height={TILE_IMAGE_PX} className="max-w-none shrink-0" />}
  </span>
);

/** An app's icon image at a kit icon size; an empty slot of the same size when there is none, so rows line up. */
export const AppImage: React.FC<{ src?: string | null; size: AppIconSize }> = ({ src, size }) => {
  if (size === 'tile') return <TileImage src={src} />;
  const px = ICON_SIZE_PX[size];
  if (!src) return <span aria-hidden className="shrink-0 inline-block" style={{ width: px, height: px }} />;
  return <img src={src} alt="" aria-hidden width={px} height={px} className="shrink-0" />;
};

export const AppIcon: React.FC<AppIconProps> = ({ app, size, fallback }) => (
  <AppImage src={useAppIcon(app) ?? fallback} size={size} />
);
