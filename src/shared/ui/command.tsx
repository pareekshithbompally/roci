import { Command as CommandPrimitive } from 'cmdk';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
} from './dialog';
import { cn } from './utils';

export const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex flex-col overflow-hidden',
      'bg-[var(--surface-modal)]',
      'rounded-[var(--radius-lg)]',
      'text-[var(--text-primary)]',
      className,
    )}
    {...props}
  />
));
Command.displayName = 'Command';

export const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      'flex w-full',
      'px-3 py-3',
      'text-sm',
      'bg-transparent',
      'border-b border-[var(--border-default)]',
      'text-[var(--text-primary)]',
      'placeholder:text-[var(--text-faint)]',
      'outline-none',
      className,
    )}
    {...props}
  />
));
CommandInput.displayName = 'CommandInput';

export const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto custom-scrollbar p-1', className)}
    {...props}
  />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn('py-6 text-center text-sm text-[var(--text-muted)]', className)}
    {...props}
  />
));
CommandEmpty.displayName = 'CommandEmpty';

export const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
      '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
      '[&_[cmdk-group-heading]]:text-[var(--text-faint)]',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = 'CommandGroup';

export const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex items-center gap-1.5',
      'px-2 py-1.5',
      'text-[13px]',
      'rounded-[var(--radius-sm)]',
      'cursor-default select-none',
      'data-[selected=true]:bg-[var(--surface-selected)]',
      'text-[var(--text-primary)]',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';

export const CommandSeparator = forwardRef<
  ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('h-px my-1 bg-[var(--border-default)]', className)}
    {...props}
  />
));
CommandSeparator.displayName = 'CommandSeparator';

interface CommandDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  shouldFilter?: boolean;
}

export function CommandDialog({ open, onOpenChange, children, shouldFilter }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="!p-0 overflow-hidden max-w-lg top-[20vh] !-translate-y-0">
          <Command shouldFilter={shouldFilter}>{children}</Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
