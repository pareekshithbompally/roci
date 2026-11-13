import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { SettingsInput } from './SettingsInput';
import {  } from '@config/theme.config';
import { Button } from '@shared/ui';

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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

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
          <Button variant="ghost" size="iconSm" type="button"
            onClick={() => setShowSecret(!showSecret)} title={showSecret ? 'Hide' : 'Show'}>
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          {showCopy && (
            <Button variant="ghost" size="iconSm" type="button"
              onClick={handleCopy} title="Copy to clipboard">
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          )}
        </>
      }
    />
  );
};
