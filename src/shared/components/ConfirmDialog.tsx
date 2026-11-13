/**
 * ConfirmDialog
 *
 * A two-button confirmation on Radix AlertDialog (blocks click-outside by
 * design): Cancel, and a danger action that confirms.
 */

import React from 'react';
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@shared/ui';
import { TEXT, COMPONENT, BORDER } from '@config/theme.config';

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
        <AlertDialogTitle className="text-base font-semibold mb-1.5">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription className={`text-sm ${TEXT.secondary} mb-5`}>
          {description}
        </AlertDialogDescription>
        <div className="flex gap-2.5 justify-end">
          <AlertDialogCancel asChild>
            <button className={`px-3.5 py-2 text-sm font-medium ${TEXT.primary} border ${BORDER.strong} rounded-lg hover:bg-parchment-200/60 dark:hover:bg-night-700/60 transition-colors`}>
              {cancelLabel}
            </button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button
              onClick={onConfirm}
              className={`px-3.5 py-2 text-sm font-medium ${COMPONENT.dangerButton} rounded-lg`}
            >
              {confirmLabel}
            </button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
);

export default ConfirmDialog;
