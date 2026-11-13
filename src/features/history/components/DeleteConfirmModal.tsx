/**
 * DeleteConfirmModal Component
 *
 * Confirmation modal for deleting history items.
 */

import React from 'react';
import { ConfirmDialog } from '@shared/components/ConfirmDialog';

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
  <ConfirmDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Delete this session?"
    description="This action cannot be undone. The session and all its data will be permanently removed."
    confirmLabel="Delete"
    onConfirm={onConfirm}
  />
);

export default DeleteConfirmModal;
