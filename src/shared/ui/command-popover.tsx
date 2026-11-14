/**
 * CommandPopover + CommandFlyout — the composer picker pattern.
 *
 * - `CommandPopover`: trigger + popover holding a searchable Command list
 *   (search partition on top, scrolling list, empty state). Used by the model
 *   picker and the tools picker so both look and behave identically.
 * - `CommandFlyout`: a second-level list that opens beside one row, on hover
 *   or Enter (submenu pattern). Rendered inside the parent's React tree, so
 *   clicks in it never dismiss the parent popover.
 *
 * Both stay inside the window (collision padding + Radix's measured
 * available height) and scroll instead of overflowing.
 */

import React from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from './command';
import { cn } from './utils';

/** Shell never taller than the space Radix measured; the list shrinks with it. */
const SHELL = 'p-0 flex flex-col max-h-[var(--radix-popover-content-available-height)]';
const LIST = 'max-h-80 min-h-0 flex-1';

interface CommandPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger button (rendered via PopoverTrigger asChild). */
  trigger: React.ReactElement;
  searchPlaceholder: string;
  emptyText: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

export function CommandPopover({
  open,
  onOpenChange,
  trigger,
  searchPlaceholder,
  emptyText,
  side = 'top',
  align = 'start',
  className,
  children,
}: CommandPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={UI_CONFIG.picker.sideOffset}
        collisionPadding={UI_CONFIG.picker.collisionPadding}
        width="xl"
        className={cn(SHELL, className)}
      >
        <Command className="min-h-0">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className={LIST}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface CommandFlyoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row the flyout opens beside (a CommandItem). */
  anchor: React.ReactElement;
  heading: React.ReactNode;
  children: React.ReactNode;
}

export function CommandFlyout({ open, onOpenChange, anchor, heading, children }: CommandFlyoutProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={UI_CONFIG.picker.flyoutOffset}
        collisionPadding={UI_CONFIG.picker.collisionPadding}
        // Closes without the exit animation so moving between rows swaps flyouts instead of overlapping two.
        width="md"
        className={cn(SHELL, 'data-[state=closed]:animate-none')}
        // Hover-opened: keep focus (and typing) in the parent's search field.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="min-h-0">
          <CommandList className={LIST}>
            <CommandGroup heading={heading}>{children}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
