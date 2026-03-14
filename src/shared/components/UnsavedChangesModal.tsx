/**
 * UnsavedChangesModal Component
 *
 * Modal that warns users when they attempt to navigate away with unsaved changes.
 * Uses UnsavedChangesContext for state management.
 * Uses Radix AlertDialog — blocks click-outside by design.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
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

export const UnsavedChangesModal: React.FC = () => {
  const { showWarningModal, confirmNavigation, cancelNavigation } = useUnsavedChanges();

  return (
    <AlertDialog
      open={showWarningModal}
      onOpenChange={(open) => { if (!open) cancelNavigation(); }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent>
          {/* Icon */}
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>

          {/* Title */}
          <AlertDialogTitle className="mb-2">
            Unsaved Changes
          </AlertDialogTitle>

          {/* Message */}
          <AlertDialogDescription className="mb-6">
            You have unsaved changes that will be lost if you leave this page.
            Do you want to discard your changes?
          </AlertDialogDescription>

          {/* Actions */}
          <div className="flex gap-3">
            <AlertDialogCancel asChild>
              <button className={`flex-1 px-4 py-2.5 ${COMPONENT.secondaryButton} rounded-lg text-sm font-medium`}>
                Stay on Page
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={confirmNavigation}
                className={`flex-1 px-4 py-2.5 ${COMPONENT.dangerButton} rounded-lg text-sm font-medium`}
              >
                Discard Changes
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

export default UnsavedChangesModal;
