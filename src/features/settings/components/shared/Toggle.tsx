import React from 'react';
import { Switch } from '@shared/ui';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  label?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  size = 'sm',
  disabled = false,
  label,
}) => {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      size={size}
      disabled={disabled}
      aria-label={label}
    />
  );
};
