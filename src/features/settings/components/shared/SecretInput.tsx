import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useCopiedFlag } from '@shared/hooks';
import { SettingsInput } from './SettingsInput';
import { Button, Icon } from '@shared/ui';

interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  label?: string;
  helper?: string;
  showCopy?: boolean;
  disabled?: boolean;
}

export const SecretInput: React.FC<SecretInputProps> = ({
  value,
  onChange,
  onBlur,
  placeholder,
  label,
  helper,
  showCopy = true,
  disabled,
}) => {
  const [showSecret, setShowSecret] = useState(false);
  const { copied, markCopied } = useCopiedFlag();

  const handleCopy = useCallback(async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    markCopied();
  }, [value, markCopied]);

  return (
    <SettingsInput
      type={showSecret ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      label={label}
      helper={helper}
      disabled={disabled}
      actions={
        <>
          <Button variant="ghost" size="iconSm" onClick={() => setShowSecret(!showSecret)} title={showSecret ? 'Hide' : 'Show'}>
            <Icon icon={showSecret ? EyeOff : Eye} size="sm" />
          </Button>
          {showCopy && (
            <Button variant="ghost" size="iconSm" onClick={handleCopy} title="Copy to clipboard">
              <Icon icon={copied ? Check : Copy} size="sm" tone={copied ? 'success' : 'inherit'} />
            </Button>
          )}
        </>
      }
    />
  );
};
