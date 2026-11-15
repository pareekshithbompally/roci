import { Command as CommandPrimitive } from 'cmdk';
import { Title as DialogPrimitiveTitle } from '@radix-ui/react-dialog';
import type { ComponentProps, ReactNode } from 'react';
import { Dialog, DialogPortal, DialogOverlay, DialogContent } from './dialog';
import { cn } from './utils';
import { MENU_ITEM, MENU_SEPARATOR } from './recipes';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex flex-col overflow-hidden rounded-lg text-primary', className)} {...props} />;
}

export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      className={cn(
        'flex w-full px-3 py-3 bg-transparent border-b border-muted text-body text-primary placeholder:text-faint outline-none',
        className,
      )}
      {...props}
    />
  );
}

/** cmdk wraps List children in a sizer div; `fill` makes it a full-height column so a lone status child can center. */
const LIST_FILL = 'h-72 [&>[cmdk-list-sizer]]:flex [&>[cmdk-list-sizer]]:min-h-full [&>[cmdk-list-sizer]]:flex-col';

interface CommandListProps extends ComponentProps<typeof CommandPrimitive.List> {
  /** Fixed-height frame whose sizer fills it (palettes that never resize). */
  fill?: boolean;
}

export function CommandList({ fill, className, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-72 overflow-y-auto custom-scrollbar p-1', fill && LIST_FILL, className)}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className={cn('py-6 text-center text-body text-muted', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-callout [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn(MENU_ITEM, 'gap-1.5 data-[selected=true]:bg-hover', className)} {...props} />;
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn(MENU_SEPARATOR, className)} {...props} />;
}

interface CommandDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  shouldFilter?: boolean;
}

/** Command palette dialog: top-anchored and slides down on open, on a bare dialog surface. */
export function CommandDialog({ open, onOpenChange, children, shouldFilter }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          bare
          className="left-1/2 top-[18vh] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-base p-0 shadow-overlay data-[state=open]:animate-palette-show data-[state=closed]:animate-palette-hide"
        >
          <DialogPrimitiveTitle className="sr-only">Search</DialogPrimitiveTitle>
          <Command shouldFilter={shouldFilter}>{children}</Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
