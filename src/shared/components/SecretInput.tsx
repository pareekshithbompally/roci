/** A key or token in a compact field (FieldRow): hidden by default, with show and copy inside its end. */

import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useCopiedFlag } from '@shared/hooks';
import { IconButton, Input } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';

interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The field's name (its row title). */
  label: string;
}

export const SecretInput: React.FC<SecretInputProps> = ({ value, onChange, placeholder, label }) => {
  const [showSecret, setShowSecret] = useState(false);
  const { copied, markCopied } = useCopiedFlag();

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      markCopied();
    } catch (error: unknown) {
      console.error('[SecretInput] Copy failed:', error);
    }
  }, [value, markCopied]);

  return (
    <Input
      size="sm"
      type={showSecret ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      trailing={
        <>
          <IconButton icon={showSecret ? EyeOff : Eye} label={showSecret ? KIT_COPY.hide : KIT_COPY.show} size="xs" onClick={() => setShowSecret(!showSecret)} />
          <IconButton icon={copied ? Check : Copy} label={KIT_COPY.copy} size="xs" onClick={() => void handleCopy()} />
        </>
      }
    />
  );
};
