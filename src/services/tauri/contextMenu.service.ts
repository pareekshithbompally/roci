/** The system menu at a point (macOS NSMenu via Tauri's menu API): built from plain entries, shown once, then dropped. */

import { MENU_ICON_PX } from '@config/ui.config';
import type { MenuEntry } from './types';

type NativeItem = Awaited<ReturnType<typeof import('@tauri-apps/api/menu').MenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').IconMenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').CheckMenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').PredefinedMenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').Submenu.new>>;

const icons = new Map<string, Promise<Uint8Array | null>>();

/** An image URL as PNG bytes at menu size, once per URL; null when it can't load (the row shows without it). */
function menuIcon(url: string): Promise<Uint8Array | null> {
  const known = icons.get(url);
  if (known) return known;
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`menu icon failed: ${url}`));
    img.src = url;
  })
    .then(async (img) => {
      const canvas = new OffscreenCanvas(MENU_ICON_PX, MENU_ICON_PX);
      canvas.getContext('2d')?.drawImage(img, 0, 0, MENU_ICON_PX, MENU_ICON_PX);
      return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    })
    .catch((error: unknown) => {
      console.warn('[contextMenu] icon:', error);
      return null;
    });
  icons.set(url, loaded);
  return loaded;
}

async function labelItem(text: string, iconUrl: string | undefined): Promise<NativeItem> {
  const { MenuItem, IconMenuItem } = await import('@tauri-apps/api/menu');
  const icon = iconUrl ? await menuIcon(iconUrl) : null;
  return icon ? IconMenuItem.new({ text, enabled: false, icon }) : MenuItem.new({ text, enabled: false });
}

async function build(entries: MenuEntry[]): Promise<NativeItem[]> {
  const { MenuItem, CheckMenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu');
  return Promise.all(entries.map(async (entry): Promise<NativeItem> => {
    switch (entry.type) {
      case 'item':
        return MenuItem.new({ text: entry.label, enabled: !entry.disabled, action: entry.onSelect });
      case 'check':
        return CheckMenuItem.new({ text: entry.label, checked: entry.checked, enabled: !entry.disabled, action: entry.onSelect });
      case 'label':
        return labelItem(entry.label, entry.icon);
      case 'separator':
        return PredefinedMenuItem.new({ item: 'Separator' });
      case 'submenu':
        return Submenu.new({ text: entry.label, items: await build(entry.items) });
    }
  }));
}

/** Shows the menu with its top-left at `x, y` (window points). */
export async function popupMenu(entries: MenuEntry[], x: number, y: number): Promise<void> {
  const [{ Menu }, { LogicalPosition }] = await Promise.all([import('@tauri-apps/api/menu'), import('@tauri-apps/api/dpi')]);
  const menu = await Menu.new({ items: await build(entries) });
  await menu.popup(new LogicalPosition(x, y));
}
