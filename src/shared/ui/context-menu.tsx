/** A long press's menu (iPhone), drawn as the kit's dropdown is. */

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { MENU_LABEL } from './recipes';
import { keepClick, MENU_PARTS, MenuRowBody } from './menu-parts';
import { platform } from '@platform/index';
import { haptic } from '@platform/haptics';
import { UI_CONFIG } from '@config/ui.config';

const { list: LIST, item: ITEM, separator: SEPARATOR } = MENU_PARTS;

/** Opening on a long press is felt, as iOS's own context menus are. */
export function ContextMenu({ onOpenChange, ...props }: ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return (
    <ContextMenuPrimitive.Root
      {...props}
      onOpenChange={(open) => {
        if (open) haptic('pressed');
        onOpenChange?.(open);
      }}
    />
  );
}

/** What a long press opens the menu on; on a touch screen the press opens the menu, not text selection or the callout. */
export function ContextMenuTrigger({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger className={cn(platform.hasTouchScreen && 'select-none [-webkit-touch-callout:none]', className)} {...props} />;
}

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content collisionPadding={UI_CONFIG.picker.collisionPadding} className={cn(LIST, className)} onClick={keepClick} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export interface ContextMenuItemProps extends ComponentProps<typeof ContextMenuPrimitive.Item> {
  /** Its glyph, at the row's trailing edge (as iOS lays a menu row out). */
  icon?: LucideIcon;
}

export function ContextMenuItem({ icon, className, children, ...props }: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item className={cn(ITEM, className)} {...props}>
      <MenuRowBody icon={icon}>{children}</MenuRowBody>
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn(SEPARATOR, className)} {...props} />;
}

export function ContextMenuLabel({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return <ContextMenuPrimitive.Label className={cn(MENU_LABEL, className)} {...props} />;
}
