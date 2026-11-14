/**
 * ConfirmDialog
 *
 * A two-button confirmation on Radix AlertDialog (blocks click-outside by
 * design): Cancel, and a danger action that confirms.
 */

import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, Button } from '@shared/ui';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancel',
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogContent className="max-w-sm p-5">
        <AlertDialogTitle className="mb-1.5">{title}</AlertDialogTitle>
        <AlertDialogDescription className="mb-5">{description}</AlertDialogDescription>
        <div className="flex gap-2.5 justify-end">
          <AlertDialogCancel asChild>
            <Button variant="outline" size="md">{cancelLabel}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="danger" size="md" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
);

