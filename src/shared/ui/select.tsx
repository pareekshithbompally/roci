import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronsUpDown } from 'lucide-react';
import type React from 'react';
import type { ComponentProps } from 'react';
import { cn } from './utils';
import { POPUP_BUTTON, MENU_LIST, MENU_ITEM, MENU_LABEL, MENU_SEPARATOR } from './recipes';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        POPUP_BUTTON,
        // Hugs its value like a macOS pop-up button, up to its container's width (then the value truncates).
        'w-auto max-w-full flex items-center gap-2 min-w-0 overflow-hidden data-[placeholder]:text-faint',
        // Radix renders Select.Value as the direct span child: let it shrink, not push the chevron out.
        '[&>span]:min-w-0 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/** Opens under its pop-up button, right edges aligned (pickers sit at the end of their row). */
export function SelectContent({ className, children, position = 'popper', align = 'end', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        // About eight rows at most (never more than the room below the trigger); the list scrolls inside.
        className={cn(MENU_LIST, 'p-0 overflow-hidden max-h-[min(16rem,var(--radix-select-content-available-height))]', className)}
        position={position}
        align={align}
        sideOffset={position === 'popper' ? 4 : undefined}
        {...props}
      >
        {/* Scrolls like every other list in the app (thin bar on hover), not with Radix's arrow rows. */}
        <SelectPrimitive.Viewport
          className={cn('custom-scrollbar p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export interface SelectItemProps extends ComponentProps<typeof SelectPrimitive.Item> {
  /** Leading glyph (provider logo, model icon). */
  icon?: React.ReactNode;
  /** Second line under the label: status, next step. Not part of the selected value's text. */
  description?: React.ReactNode;
  /** At the row's end: a status or the step it needs (download, allow). */
  trailing?: React.ReactNode;
}

export function SelectItem({ className, children, icon, description, trailing, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item className={cn(MENU_ITEM, description && 'items-start', className)} {...props}>
      {icon && <span className={cn('shrink-0 flex', description && 'mt-0.5')}>{icon}</span>}
      <span className="flex flex-col min-w-0 flex-1">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description && <span className="text-callout text-faint truncate">{description}</span>}
      </span>
      {trailing && <span className="shrink-0 flex items-center">{trailing}</span>}
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={cn(MENU_LABEL, className)} {...props} />;
}

export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cn(MENU_SEPARATOR, className)} {...props} />;
}
