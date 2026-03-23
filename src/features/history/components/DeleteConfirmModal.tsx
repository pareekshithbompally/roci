/**
 * DeleteConfirmModal Component
 *
 * Confirmation modal for deleting history items.
 * Uses Radix AlertDialog — blocks click-outside by design.
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

interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogContent className="max-w-sm p-5">
        <AlertDialogTitle className="text-base font-semibold mb-1.5">
          Delete this session?
        </AlertDialogTitle>
        <AlertDialogDescription className={`text-sm ${TEXT.secondary} mb-5`}>
          This action cannot be undone. The session and all its data will be permanently removed.
        </AlertDialogDescription>
        <div className="flex gap-2.5 justify-end">
          <AlertDialogCancel asChild>
            <button className={`px-3.5 py-2 text-sm font-medium ${TEXT.primary} border ${BORDER.strong} rounded-lg hover:bg-parchment-200/60 dark:hover:bg-night-700/60 transition-colors`}>
              Cancel
            </button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button
              onClick={onConfirm}
              className={`px-3.5 py-2 text-sm font-medium ${COMPONENT.dangerButton} rounded-lg`}
            >
              Delete
            </button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
);

export default DeleteConfirmModal;
