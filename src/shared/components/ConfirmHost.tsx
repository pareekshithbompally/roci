/** Renders the one app-wide `confirm()` prompt; no click-outside dismiss, Esc and Cancel resolve false. */

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  Button,
} from '@shared/ui';
import { settleConfirm, useConfirmOpen, useConfirmRequest } from '@shared/stores/confirmStore';

export const ConfirmHost: React.FC = () => {
  const request = useConfirmRequest();
  const open = useConfirmOpen();
  if (!request) return null;

  const { title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'default' } = request;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) settleConfirm(false); }}>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        {/* No description → opt out of aria-describedby explicitly (Radix warns otherwise). */}
        <AlertDialogContent {...(description ? {} : { 'aria-describedby': undefined })}>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="md">{cancelLabel}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'accent'} size="md" onClick={() => settleConfirm(true)}>
                {confirmLabel}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};
