/** The system menu at a point (macOS NSMenu via Tauri's menu API): built from plain entries, shown once, then dropped. */

import type { MenuEntry } from './types';

type NativeItem = Awaited<ReturnType<typeof import('@tauri-apps/api/menu').MenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').CheckMenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').PredefinedMenuItem.new>>
  | Awaited<ReturnType<typeof import('@tauri-apps/api/menu').Submenu.new>>;

async function build(entries: MenuEntry[]): Promise<NativeItem[]> {
  const { MenuItem, CheckMenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu');
  return Promise.all(entries.map(async (entry): Promise<NativeItem> => {
    switch (entry.type) {
      case 'item':
        return MenuItem.new({ text: entry.label, enabled: !entry.disabled, action: entry.onSelect });
      case 'check':
        return CheckMenuItem.new({ text: entry.label, checked: entry.checked, enabled: !entry.disabled, action: entry.onSelect });
      case 'label':
        return MenuItem.new({ text: entry.label, enabled: false });
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
