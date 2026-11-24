/** What the kit's drawn menus (a button's dropdown, a long press's context menu) share: one look per device, a pick that
 *  stays in the menu, and one row layout. */

import type { MouseEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './icon';
import type { TextTone } from './text';
import { MENU_LIST, MENU_ITEM, MENU_SEPARATOR, MENU_TOUCH } from './recipes';
import { platform } from '@platform/index';

/** A finger picks from it (iPhone): iOS's menu proportions over the Mac's compact ones. */
const touch = platform.hasTouchScreen;
export const MENU_PARTS = {
  list: touch ? MENU_TOUCH.list : MENU_LIST,
  item: touch ? MENU_TOUCH.item : MENU_ITEM,
  separator: touch ? MENU_TOUCH.separator : MENU_SEPARATOR,
} as const;

/** A menu is portalled, but React still bubbles its clicks to the element it was opened from (a sidebar row that opens its
 *  chat): a pick stays in the menu. */
export const keepClick = (e: MouseEvent) => e.stopPropagation();

/** A row's label, and its glyph at the trailing edge (as iOS lays a menu row out). */
export function MenuRowBody({ icon, tone = 'inherit', children }: { icon?: LucideIcon; tone?: TextTone; children: ReactNode }) {
  return (
    <>
      <span className="min-w-0 flex-1">{children}</span>
      {icon && <Icon icon={icon} size="sm" tone={tone} className="shrink-0" />}
    </>
  );
}
