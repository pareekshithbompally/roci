import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';
import { MENU_LABEL } from './recipes';
import { keepClick, MENU_PARTS, MenuRowBody } from './menu-parts';
import { UI_CONFIG } from '@config/ui.config';

const { list: LIST, item: ITEM, separator: SEPARATOR } = MENU_PARTS;

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content sideOffset={sideOffset} collisionPadding={UI_CONFIG.picker.collisionPadding} className={cn(LIST, className)} onClick={keepClick} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends ComponentProps<typeof DropdownMenuPrimitive.Item> {
  variant?: 'default' | 'danger';
  /** Its glyph, at the row's trailing edge (as iOS lays a menu row out). */
  icon?: LucideIcon;
}

export function DropdownMenuItem({ variant = 'default', icon, className, children, ...props }: DropdownMenuItemProps) {
  const danger = variant === 'danger';
  return (
    <DropdownMenuPrimitive.Item className={cn(ITEM, danger && 'text-danger data-[highlighted]:bg-danger-subtle', className)} {...props}>
      <MenuRowBody icon={icon} tone={danger ? 'danger' : 'inherit'}>{children}</MenuRowBody>
    </DropdownMenuPrimitive.Item>
  );
}

/** A toggle row: label, trailing check when on. Stays open on select so the change is visible. */
export function DropdownMenuCheckboxItem({ className, children, onSelect, ...props }: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(ITEM, className)}
      onSelect={(event) => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="ml-auto flex">
        <Icon icon={Check} size="sm" tone="accent" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn(SEPARATOR, className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn(MENU_LABEL, className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger className={cn(ITEM, 'data-[state=open]:bg-hover', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto h-4 w-4 text-faint" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent className={cn(LIST, className)} onClick={keepClick} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}
