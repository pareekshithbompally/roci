/**
 * DeleteConfirmModal Component
 *
 * Confirmation modal for deleting history items.
 * Uses Radix AlertDialog — blocks click-outside by design.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { TEXT, COMPONENT } from '@config/theme.config';

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
      <AlertDialogContent>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
          </div>
          <AlertDialogTitle>Delete Session?</AlertDialogTitle>
        </div>
        <AlertDialogDescription className="pl-[52px]">
          This action cannot be undone. The session and all its data will be permanently deleted.
        </AlertDialogDescription>
        <div className="flex gap-3 justify-end mt-6">
          <AlertDialogCancel asChild>
            <button className={`px-4 py-2.5 text-sm font-semibold ${COMPONENT.secondaryButton} rounded-xl`}>
              Cancel
            </button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button
              onClick={onConfirm}
              className={`px-4 py-2.5 text-sm font-semibold ${COMPONENT.dangerButton} rounded-xl`}
            >
              Delete Session
            </button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
);

export default DeleteConfirmModal;
