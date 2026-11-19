/** The native menu on a Mac (native/choice_menu.m): headers, icon rows that pick, switch rows that stay open, submenus. */

import { invoke } from '@tauri-apps/api/core';
import { MENU_ICON_PT } from '@config/ui.config';

/** An icon: an image URL (a logo, a cached avatar, a rendered glyph) or an SF Symbol name; `template` glyphs and symbols take the menu's light or dark tint. */
interface MenuIcon {
  icon?: string | null;
  symbol?: string;
  template?: boolean;
}

/** One entry of a native menu. Rows pick and close; toggles switch and keep the menu open; submenus fan out. */
export type NativeMenuEntry =
  | { kind: 'header'; title: string }
  | { kind: 'separator' }
  | ({ kind: 'row'; id: string; title: string; /** Grey second line. */ subtitle?: string; checked?: boolean; enabled: boolean } & MenuIcon)
  | ({ kind: 'toggle'; id: string; title: string; subtitle?: string; on: boolean; enabled: boolean } & MenuIcon)
  | ({ kind: 'submenu'; title: string; subtitle?: string; items: NativeMenuEntry[] } & MenuIcon);

/** What happened while it was open: the row picked (null when dismissed) and each switch's final state. */
export interface NativeMenuResult {
  chosen: string | null;
  toggled: Record<string, boolean>;
}

/** Rendered at 2x so the 16pt icon stays sharp on Retina. */
const ICON_PX = MENU_ICON_PT * 2;
const icons = new Map<string, Promise<string | null>>();

/** An image URL as base64 PNG at menu size, once per URL; null when it can't load (the row shows without it). */
function iconPng(url: string): Promise<string | null> {
  const known = icons.get(url);
  if (known) return known;
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`menu icon failed: ${url.slice(0, 80)}`));
    img.src = url;
  })
    .then(async (img) => {
      const canvas = new OffscreenCanvas(ICON_PX, ICON_PX);
      canvas.getContext('2d')?.drawImage(img, 0, 0, ICON_PX, ICON_PX);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    })
    .catch((error: unknown) => {
      console.warn('[nativeMenu] icon:', error);
      return null;
    });
  icons.set(url, loaded);
  return loaded;
}

/** The entries with each icon URL turned into the PNG the native side draws. */
async function withPngIcons(entries: NativeMenuEntry[]): Promise<NativeMenuEntry[]> {
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind === 'header' || entry.kind === 'separator') return entry;
    const icon = entry.icon ? await iconPng(entry.icon) : null;
    const items = entry.kind === 'submenu' ? await withPngIcons(entry.items) : undefined;
    return { ...entry, icon, ...(items && { items }) } as NativeMenuEntry;
  }));
}

/** Shows the menu with its top-left at `x, y` (window points); resolves what was picked and switched once it closes. */
export async function nativeMenu(entries: NativeMenuEntry[], x: number, y: number): Promise<NativeMenuResult> {
  const rows = await withPngIcons(entries);
  const result = await invoke<string>('native_menu', { entries: JSON.stringify(rows), x, y, iconSize: MENU_ICON_PT });
  return JSON.parse(result) as NativeMenuResult;
}
