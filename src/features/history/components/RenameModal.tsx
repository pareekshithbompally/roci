/**
 * RenameModal Component
 *
 * Compact dialog for renaming sidebar items.
 * Uses Radix Dialog primitives from @shared/ui.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button, Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle, Input } from '@shared/ui';

interface RenameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onConfirm: (newTitle: string) => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  open,
  onOpenChange,
  currentTitle,
  onConfirm,
}) => {
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(currentTitle);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open, currentTitle]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== currentTitle) {
      onConfirm(trimmed);
    }
    onOpenChange(false);
  };

  const isUnchanged = !value.trim() || value.trim() === currentTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          size="sm"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogTitle className="mb-4">Rename</DialogTitle>

          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isUnchanged) handleSubmit();
            }}
            placeholder="Enter a title"
          />

          <div className="flex justify-end gap-2.5 mt-5">
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleSubmit}
              disabled={isUnchanged}>
              Save
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default RenameModal;
