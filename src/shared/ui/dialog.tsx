import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from './utils';
import { SCRIM, SHEET, SHEET_TITLE, SHEET_DESCRIPTION } from './recipes';
import { ScrollArea } from './scroll-area';
import { SheetContent } from './bottom-sheet';
import { useFormFactor } from '@platform/formFactor';

export const Dialog = DialogPrimitive.Root;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn(SCRIM, className)} {...props} />;
}

/** `full` = wide content viewers (expanded tables) — nearly the window, still a sheet. */
const DIALOG_SIZE = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-xl', xl: 'max-w-2xl', full: 'max-w-[90vw]' } as const;

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  size?: keyof typeof DIALOG_SIZE;
  /** Height-capped sheet whose body scrolls (forms, JSON editors) */
  scrollable?: boolean;
  /** Skip the sheet chrome (centering, padding, shadow, animation) for surfaces that position themselves. */
  bare?: boolean;
}

const BARE = 'fixed z-modal focus:outline-none';


export function DialogContent({ size = 'md', scrollable, bare, className, ...props }: DialogContentProps) {
  const phone = useFormFactor() === 'phone';
  // iOS: a dialog is the kit sheet (UIKit page sheet).
  if (phone && !bare) return <SheetContent padded size={size === 'full' ? 'full' : 'fit'} className={className} {...props} />;
  const frame = bare ? cn(BARE, DIALOG_SIZE[size]) : cn(SHEET, DIALOG_SIZE[size], scrollable && 'max-h-[85vh] flex flex-col');
  return <DialogPrimitive.Content className={cn(frame, className)} {...props} />;
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between mb-4', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn(SHEET_TITLE, className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn(SHEET_DESCRIPTION, className)} {...props} />;
}

/** The scrolling middle of a `scrollable` sheet, between header and footer. */
export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <ScrollArea className={cn('flex flex-col gap-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-3 mt-6', className)} {...props} />;
}
