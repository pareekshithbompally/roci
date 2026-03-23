/**
 * UnsavedChangesModal Component
 *
 * Modal that warns users when they attempt to navigate away with unsaved changes.
 * Uses UnsavedChangesContext for state management.
 * Uses Radix AlertDialog — blocks click-outside by design.
 */

import React from 'react';
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
import { TEXT, COMPONENT, BORDER } from '@config/theme.config';

export const UnsavedChangesModal: React.FC = () => {
  const { showWarningModal, confirmNavigation, cancelNavigation } = useUnsavedChanges();

  return (
    <AlertDialog
      open={showWarningModal}
      onOpenChange={(open) => { if (!open) cancelNavigation(); }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent className="max-w-sm p-5">
          <AlertDialogTitle className="text-base font-semibold mb-1.5">
            Unsaved Changes
          </AlertDialogTitle>
          <AlertDialogDescription className={`text-sm ${TEXT.secondary} mb-5`}>
            You have unsaved changes that will be lost if you leave this page.
          </AlertDialogDescription>
          <div className="flex gap-2.5 justify-end">
            <AlertDialogCancel asChild>
              <button className={`px-3.5 py-2 text-sm font-medium ${TEXT.primary} border ${BORDER.strong} rounded-lg hover:bg-parchment-200/60 dark:hover:bg-night-700/60 transition-colors`}>
                Stay
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={confirmNavigation}
                className={`px-3.5 py-2 text-sm font-medium ${COMPONENT.dangerButton} rounded-lg`}
              >
                Discard
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

export default UnsavedChangesModal;
