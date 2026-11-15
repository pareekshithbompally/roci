/** Compact rename dialog (sidebar items, models); `clearable` lets an empty name clear the rename. */

import React, { useState, useEffect, useRef } from 'react';
import { Button, Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle, Input } from '@shared/ui';

interface RenameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  /** Called with the new name; '' only when `clearable`. */
  onConfirm: (newTitle: string) => void;
  /** An empty name is allowed and means "back to the original"; the placeholder shows that original. */
  clearable?: boolean;
  placeholder?: string;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  open,
  onOpenChange,
  currentTitle,
  onConfirm,
  clearable = false,
  placeholder = 'Enter a title',
}) => {
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(currentTitle);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open, currentTitle]);

  const trimmed = value.trim();
  const canSave = trimmed !== currentTitle && (!!trimmed || clearable);

  const handleSubmit = () => {
    if (canSave) onConfirm(trimmed);
    onOpenChange(false);
  };

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
              if (e.key === 'Enter' && canSave) handleSubmit();
            }}
            placeholder={placeholder}
          />

          <div className="flex justify-end gap-2.5 mt-5">
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleSubmit}
              disabled={!canSave}>
              Save
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

