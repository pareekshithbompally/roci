/** Date and time choosers: the system's own controls (WebKit draws Apple's compact date and time pickers on iOS and macOS). */

import React from 'react';
import { cn } from './utils';

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

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, min, placeholder = 'Date', className, disabled }) => (
  <input
    type="date"
    aria-label={placeholder}
    value={value}
    min={min}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    className={cn(NATIVE, className)}
  />
);

/** Half-hour steps, as before; the system wheel still shows every minute but snaps the value. */
const HALF_HOUR_SECONDS = 1800;

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, disabled, className }) => (
  <input
    type="time"
    aria-label="Time"
    value={value}
    step={HALF_HOUR_SECONDS}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    className={cn(NATIVE, className)}
  />
);
