/** The one rename form (sidebar items, meetings, models); `clearable` lets an empty name clear the rename. */

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';
import { FormDialog } from './FormDialog';

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
  placeholder = KIT_COPY.renamePlaceholder,
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
    <FormDialog open={open} onOpenChange={onOpenChange} title={KIT_COPY.rename} size="sm" dirty={value !== currentTitle} submit={{ label: KIT_COPY.save, onPress: handleSubmit, disabled: !canSave }}>
      <Input
        ref={inputRef}
        type="text"
        aria-label={KIT_COPY.rename}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) handleSubmit();
        }}
        placeholder={placeholder}
        autoFocus
      />
    </FormDialog>
  );
};

