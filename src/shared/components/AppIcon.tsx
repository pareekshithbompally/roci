/** A Mac app's own icon (Finder, Calendar, …) from macOS, by bundle id; `fallback` when the app isn't installed. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { ICON_SIZE_PX, type IconSize } from '@shared/ui';


interface AppIconProps {
  /** Bundle id, e.g. `com.apple.finder`. */
  app: string;
  size: IconSize;
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

export const AppIcon: React.FC<AppIconProps> = ({ app, size, fallback }) => {
  const src = useAppIcon(app) ?? fallback;
  const px = ICON_SIZE_PX[size];
  if (!src) return <span aria-hidden className="shrink-0 inline-block" style={{ width: px, height: px }} />;
  return <img src={src} alt="" aria-hidden width={px} height={px} className="shrink-0" />;
};
