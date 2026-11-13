import React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from './utils';
import { COMPONENT } from '@config/theme.config';

/**
 * Canonical checkbox with a third, mixed state (a group whose items are
 * partly on). Renders a button with `role="checkbox"` and `aria-checked`.
 */
export type CheckboxState = boolean | 'indeterminate';

export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: CheckboxState;
  onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({ checked, onCheckedChange, className, disabled, ...props }: CheckboxProps) {
  const on = checked !== false;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === 'indeterminate' ? 'mixed' : checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onCheckedChange(checked !== true);
      }}
      className={cn(COMPONENT.checkbox, on ? COMPONENT.checkboxOn : COMPONENT.checkboxOff, className)}
      {...props}
    >
      {checked === true && <Check className="w-3 h-3" strokeWidth={3} />}
      {checked === 'indeterminate' && <Minus className="w-3 h-3" strokeWidth={3} />}
    </button>
  );
}
