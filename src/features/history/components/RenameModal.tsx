/**
 * RenameModal Component
 *
 * Compact dialog for renaming sidebar items.
 * Uses Radix Dialog primitives from @shared/ui.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from '@shared/ui';
import { TEXT, COMPONENT, BORDER } from '@config/theme.config';

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
          className="max-w-sm p-5"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogTitle className="text-base font-semibold mb-4">Rename</DialogTitle>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isUnchanged) handleSubmit();
            }}
            className={`w-full px-3.5 py-2.5 text-sm ${TEXT.primary} bg-parchment-100 dark:bg-night-750 border ${BORDER.strong} rounded-xl outline-none ${BORDER.inputFocus} transition-colors`}
            placeholder="Enter a title"
          />

          <div className="flex justify-end gap-2.5 mt-5">
            <button
              onClick={() => onOpenChange(false)}
              className={`px-3.5 py-2 text-sm font-medium ${TEXT.primary} border ${BORDER.strong} rounded-lg hover:bg-parchment-200/60 dark:hover:bg-night-700/60 transition-colors`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isUnchanged}
              className={`px-3.5 py-2 text-sm font-medium ${COMPONENT.primaryButton} rounded-lg disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Save
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default RenameModal;
