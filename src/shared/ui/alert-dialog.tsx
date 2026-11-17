import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from './utils';
import { ALERT_SHEET, SCRIM, SHEET_TITLE, SHEET_DESCRIPTION } from './recipes';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export function AlertDialogOverlay({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return <AlertDialogPrimitive.Overlay className={cn(SCRIM, className)} {...props} />;
}

export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return <AlertDialogPrimitive.Content className={cn(ALERT_SHEET, className)} {...props} />;
}

/** Trailing button row: Cancel first, the action last (macOS order). */
export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 mt-5', className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn(SHEET_TITLE, className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn(SHEET_DESCRIPTION, className)} {...props} />;
}
