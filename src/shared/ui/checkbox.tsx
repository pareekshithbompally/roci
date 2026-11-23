import React from 'react';
import { Check, Minus } from 'lucide-react';
import { platform } from '@platform/index';
import { cn } from './utils';

/** Canonical checkbox with a mixed state; renders a button with `role="checkbox"` and `aria-checked`. */
export type CheckboxState = boolean | 'indeterminate';

export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: CheckboxState;
  onCheckedChange: (checked: boolean) => void;
}

const BASE =
  'inline-flex items-center justify-center shrink-0 w-4 h-4 rounded border transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';
/** A 44 pt target around the 16 pt box on touch screens. */
const TOUCH = platform.hasTouchScreen && "relative after:absolute after:-inset-3.5 after:content-['']";
const ON = 'bg-accent border-accent text-on-accent';
const OFF = 'bg-base border-strong';

export function Checkbox({ checked, onCheckedChange, className, disabled, ...props }: CheckboxProps) {
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
      className={cn(BASE, TOUCH, checked === false ? OFF : ON, className)}
      {...props}
    >
      {checked === true && <Check className="w-3 h-3" strokeWidth={3} />}
      {checked === 'indeterminate' && <Minus className="w-3 h-3" strokeWidth={3} />}
    </button>
  );
}
