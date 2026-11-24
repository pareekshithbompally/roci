/** Date and time choosers: the system's own controls (WebKit draws Apple's compact date and time pickers on iOS and macOS). */

import React, { useRef } from 'react';
import { cn } from './utils';
import { Button } from './button';
import { KIT_COPY } from '@config/kitCopy.config';

interface DatePickerProps {
  /** Selected date as YYYY-MM-DD string */
  value: string;
  /** Callback with YYYY-MM-DD string (or '' for clear) */
  onChange: (value: string) => void;
  /** Minimum selectable date as YYYY-MM-DD */
  min?: string;
  /** Accessible name when no date is chosen yet */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Shown instead of the field (e.g. the range on screen): a button that opens the system date picker, so one date format shows. */
  children?: React.ReactNode;
  /** The children are the trigger as they are (a title), with no button shape around them. */
  plain?: boolean;
}

interface TimePickerProps {
  /** Selected time as HH:MM string */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** The system control keeps its own look; we only clear the web defaults around it and use the body text style. */
const NATIVE = 'bg-transparent text-body text-primary outline-none disabled:opacity-50';

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, min, placeholder = 'Date', className, disabled, children, plain }) => {
  const ref = useRef<HTMLInputElement>(null);
  const field = (
    <input
      ref={ref}
      type="date"
      aria-label={placeholder}
      value={value}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={children ? 'sr-only' : cn(NATIVE, className)}
      tabIndex={children ? -1 : undefined}
    />
  );
  if (!children) return field;
  // The hidden field stays under its label, so the system picker opens there.
  return (
    <span className={cn('relative inline-flex', className)}>
      <Button variant={plain ? 'glyph' : 'ghost'} size={plain ? 'inline' : 'sm'} disabled={disabled} aria-label={placeholder} onClick={() => ref.current?.showPicker()}>
        {children}
      </Button>
      {field}
    </span>
  );
};

/** Half-hour steps, as before; the system wheel still shows every minute but snaps the value. */
const HALF_HOUR_SECONDS = 1800;

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, disabled, className }) => (
  <input
    type="time"
    aria-label={KIT_COPY.time}
    value={value}
    step={HALF_HOUR_SECONDS}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    className={cn(NATIVE, className)}
  />
);
