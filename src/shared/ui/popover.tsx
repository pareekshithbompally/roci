import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';
import { cn } from './utils';
import { FLOATING_SURFACE } from './recipes';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/** Width lives in a prop: class merging is not available, so a className width would fight the default. */
const WIDTH = {
  sm: 'w-56',
  md: 'w-64',
  lg: 'w-72',
  xl: 'w-80',
  trigger: 'w-[var(--radix-popover-trigger-width)]',
  auto: 'w-auto',
} as const;

export interface PopoverContentProps extends ComponentProps<typeof PopoverPrimitive.Content> {
  width?: keyof typeof WIDTH;
}

export function PopoverContent({ className, sideOffset = 4, width = 'lg', ...props }: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} className={cn(FLOATING_SURFACE, WIDTH[width], className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}
