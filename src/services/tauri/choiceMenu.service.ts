/** The native choice menu on a Mac (native/choice_menu.m): section headers, rows with an icon and a checkmark; resolves the chosen row. */

import { invoke } from '@tauri-apps/api/core';
import { MENU_ICON_PT } from '@config/ui.config';

/** One row of a choice menu; a row's `icon` is an image URL (a logo, a cached `data:` avatar). */
export type ChoiceEntry =
  | { kind: 'header'; title: string }
  | { kind: 'separator' }
  | { kind: 'row'; title: string; icon?: string | null; checked?: boolean; enabled: boolean };

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
    img.onerror = () => reject(new Error(`menu icon failed: ${url}`));
    img.src = url;
  })
    .then(async (img) => {
      const canvas = new OffscreenCanvas(ICON_PX, ICON_PX);
      canvas.getContext('2d')?.drawImage(img, 0, 0, ICON_PX, ICON_PX);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    })
    .catch((error: unknown) => {
      console.warn('[choiceMenu] icon:', error);
      return null;
    });
  icons.set(url, loaded);
  return loaded;
}

/** Shows the menu with its top-left at `x, y` (window points); resolves the chosen row's index, or -1 when dismissed. */
export async function choiceMenu(entries: ChoiceEntry[], x: number, y: number): Promise<number> {
  const rows = await Promise.all(entries.map(async (entry) =>
    entry.kind === 'row' && entry.icon ? { ...entry, icon: await iconPng(entry.icon) } : entry));
  return invoke<number>('choice_menu', { entries: JSON.stringify(rows), x, y, iconSize: MENU_ICON_PT });
}
