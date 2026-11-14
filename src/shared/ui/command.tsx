import { Command as CommandPrimitive } from 'cmdk';
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

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-72 overflow-y-auto custom-scrollbar p-1', className)} {...props} />;
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
