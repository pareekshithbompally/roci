/** Composer pickers: a searchable popover list plus a side flyout submenu, both clamped to the window and scrolling. */

import React from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from './command';
import { cn } from './utils';
import { Search } from 'lucide-react';
import { Icon } from './icon';
import { LIST_COMMAND, SEARCH_FIELD } from './recipes';
import { PushedScreen, useOptionalNavStack } from './nav-stack';
import { BottomSheet } from './bottom-sheet';
import { useFormFactor } from '@platform/formFactor';

/** A picker's search: the app's one search capsule (SearchField's look) around cmdk's input, on a Mac and a phone alike. */
function CommandSearch({ placeholder, value, onValueChange }: { placeholder: string; value?: string; onValueChange?: (value: string) => void }) {
  return (
    <div className={SEARCH_FIELD}>
      <Icon icon={Search} size="sm" />
      <CommandInput placeholder={placeholder} value={value} onValueChange={onValueChange} className="border-b-0 px-0 py-0" />
    </div>
  );
}

/** Shell never taller than the space Radix measured; the list shrinks with it. */
const SHELL = 'p-0 flex flex-col max-h-[var(--radix-popover-content-available-height)]';
const LIST = 'max-h-80 min-h-0 flex-1';

interface CommandPopoverContentProps {
  searchPlaceholder: string;
  /** Controlled search text, for callers that act on what was typed (e.g. add a name the list lacks). */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** `false`: the caller lists only what matches (it searches the store itself). */
  filter?: boolean;
  /** What shows when nothing matches. */
  empty: React.ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  /** `false` keeps it on `side` near a window edge (it shortens and scrolls) instead of flipping. */
  avoidCollisions?: boolean;
  width?: 'lg' | 'xl';
  /** Closed: the caller puts focus back itself (e.g. into the chat box that opened it). */
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}

/** The searchable list inside a Popover the caller owns (the composer shares one between its "@" and "/" pickers). */
export function CommandPopoverContent({
  searchPlaceholder,
  search,
  onSearchChange,
  filter = true,
  empty,
  side = 'top',
  align = 'start',
  avoidCollisions,
  width = 'xl',
  onClose,
  className,
  children,
}: CommandPopoverContentProps) {
  return (
    <PopoverContent
      side={side}
      align={align}
      avoidCollisions={avoidCollisions}
      sideOffset={UI_CONFIG.picker.sideOffset}
      collisionPadding={UI_CONFIG.picker.collisionPadding}
      width={width}
      className={cn(SHELL, className)}
      onCloseAutoFocus={
        onClose &&
        ((e) => {
          e.preventDefault();
          onClose();
        })
      }
    >
      <Command className="min-h-0" shouldFilter={filter}>
        <div className="p-2 pb-1">
          <CommandSearch placeholder={searchPlaceholder} value={search} onValueChange={onSearchChange} />
        </div>
        <CommandList className={LIST}>
          <CommandEmpty>{empty}</CommandEmpty>
          {children}
        </CommandList>
      </Command>
    </PopoverContent>
  );
}

interface CommandPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger button (rendered via PopoverTrigger asChild; on a phone its click pushes the screen). */
  trigger: React.ReactElement<{ onClick?: React.MouseEventHandler }>;
  /** The pushed screen's title when it opens as a screen (phone, inside a NavStack). */
  title?: string;
  searchPlaceholder: string;
  /** Controlled search text, for callers that act on what was typed (e.g. add a name the list lacks). */
  search?: string;
  onSearchChange?: (search: string) => void;
  emptyText: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  /** `false` keeps it on `side` near a window edge (it shortens and scrolls) instead of flipping. */
  avoidCollisions?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** A searchable list: a popover by its trigger; on a phone inside a NavStack, a pushed screen in the same sheet (iOS). */
export function CommandPopover({
  open,
  onOpenChange,
  trigger,
  title,
  searchPlaceholder,
  search,
  onSearchChange,
  emptyText,
  side = 'top',
  align = 'start',
  avoidCollisions,
  className,
  children,
}: CommandPopoverProps) {
  const stack = useOptionalNavStack();
  const phone = useFormFactor() === 'phone';
  if (phone) {
    // iOS: a search field over an inset grouped list — a pushed screen inside a sheet's stack, else its own sheet.
    const body = (
      <Command className="min-h-0 gap-3 rounded-none px-4 pb-sheet-end pt-2">
        <CommandSearch placeholder={searchPlaceholder} value={search} onValueChange={onSearchChange} />
        <CommandList className={cn('min-h-0 max-h-none overflow-y-auto p-0', LIST_COMMAND)}>
          <CommandEmpty>{emptyText}</CommandEmpty>
          {children}
        </CommandList>
      </Command>
    );
    const sheetTitle = title ?? searchPlaceholder;
    return (
      <>
        {React.cloneElement(trigger, { onClick: () => onOpenChange(true) })}
        {stack
          ? <PushedScreen open={open} title={sheetTitle} onClose={() => onOpenChange(false)}>{body}</PushedScreen>
          : <BottomSheet open={open} onOpenChange={onOpenChange} title={sheetTitle} steady>{body}</BottomSheet>}
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <CommandPopoverContent
        searchPlaceholder={searchPlaceholder}
        search={search}
        onSearchChange={onSearchChange}
        empty={emptyText}
        side={side}
        align={align}
        avoidCollisions={avoidCollisions}
        className={className}
      >
        {children}
      </CommandPopoverContent>
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
