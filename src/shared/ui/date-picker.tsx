/**
 * DatePicker — Custom calendar popover built on Radix Popover.
 * Replaces native <input type="date"> with a themed, app-consistent calendar.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './utils';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';

// ── Types ───────────────────────────────────────────────────────

interface DatePickerProps {
  /** Selected date as YYYY-MM-DD string */
  value: string;
  /** Callback with YYYY-MM-DD string (or '' for clear) */
  onChange: (value: string) => void;
  /** Minimum selectable date as YYYY-MM-DD */
  min?: string;
  /** Placeholder when no date selected */
  placeholder?: string;
  /** Additional class on trigger */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

interface TimePickerProps {
  /** Selected time as HH:MM string */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday-based offset (0=Mon, 6=Sun) */
function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYMD(ymd: string): { year: number; month: number; day: number } | null {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function formatDisplayDate(ymd: string): string {
  const parsed = parseYMD(ymd);
  if (!parsed) return '';
  const date = new Date(parsed.year, parsed.month, parsed.day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Calendar Grid ───────────────────────────────────────────────

interface CalendarProps {
  selectedDate: string;
  minDate?: string;
  onSelect: (ymd: string) => void;
}

const CalendarGrid: React.FC<CalendarProps> = ({ selectedDate, minDate, onSelect }) => {
  const today = useMemo(() => {
    const d = new Date();
    return toYMD(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const initialMonth = useMemo(() => {
    const parsed = parseYMD(selectedDate);
    if (parsed) return { year: parsed.year, month: parsed.month };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [selectedDate]);

  const [viewYear, setViewYear] = useState(initialMonth.year);
  const [viewMonth, setViewMonth] = useState(initialMonth.month);

  const goToPrevMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 0) {
        setViewYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 11) {
        setViewYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstOffset = getFirstDayOffset(viewYear, viewMonth);

  // Previous month trailing days
  const prevMonthDays = firstOffset;
  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const minParsed = minDate ? parseYMD(minDate) : null;
  const isBeforeMin = (ymd: string): boolean => {
    if (!minParsed) return false;
    return ymd < minDate!;
  };

  return (
    <div className="p-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={goToPrevMonth}
          className={`p-1 rounded-md ${TEXT.muted} ${SURFACE.hoverSubtle} transition-colors`}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className={`text-xs font-semibold ${TEXT.heading}`}>
          {monthLabel}
        </span>
        <button
          onClick={goToNextMonth}
          className={`p-1 rounded-md ${TEXT.muted} ${SURFACE.hoverSubtle} transition-colors`}
          aria-label="Next month"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className={`text-center text-[10px] font-medium ${TEXT.faint} py-1`}>
            {day}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7">
        {/* Previous month trailing */}
        {Array.from({ length: prevMonthDays }, (_, i) => {
          const d = daysInPrevMonth - prevMonthDays + i + 1;
          return (
            <div key={`prev-${d}`} className={`text-center py-1 text-[11px] ${TEXT.faint} opacity-40`}>
              {d}
            </div>
          );
        })}

        {/* Current month */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ymd = toYMD(viewYear, viewMonth, day);
          const isSelected = ymd === selectedDate;
          const isToday = ymd === today;
          const disabled = isBeforeMin(ymd);

          return (
            <button
              key={day}
              onClick={() => !disabled && onSelect(ymd)}
              disabled={disabled}
              className={cn(
                'py-1 text-[11px] rounded-md transition-colors',
                isSelected
                  ? 'bg-parchment-900 dark:bg-night-100 text-white dark:text-night-900 font-semibold'
                  : isToday
                    ? `font-semibold ${TEXT.heading} bg-parchment-200/60 dark:bg-night-750/60`
                    : `${TEXT.primary} hover:bg-parchment-200 dark:hover:bg-night-750`,
                disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── DatePicker ──────────────────────────────────────────────────

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  placeholder = 'Select date',
  className,
  disabled,
}) => {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback((ymd: string) => {
    onChange(ymd);
    setOpen(false);
  }, [onChange]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          disabled={disabled}
          className={cn(
            `inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md}`,
            `outline-none ${BORDER.inputFocus} transition-all`,
            'disabled:opacity-50 disabled:cursor-not-allowed',
            value ? TEXT.primary : TEXT.faint,
            className,
          )}
        >
          <Calendar className="w-3 h-3 shrink-0" />
          <span className="truncate">{value ? formatDisplayDate(value) : placeholder}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          className={cn(
            'z-50 w-56',
            'bg-[var(--surface-dropdown)]',
            'border border-[var(--border-strong)]',
            'rounded-[var(--radius-lg)]',
            'shadow-[var(--shadow-float)]',
            'data-[state=open]:animate-content-show',
            'data-[state=closed]:animate-content-hide',
            'outline-none',
          )}
        >
          <CalendarGrid
            selectedDate={value}
            minDate={min}
            onSelect={handleSelect}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

// ── TimePicker ──────────────────────────────────────────────────

const TIME_OPTIONS = (() => {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
})();

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  disabled,
  className,
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        `px-2.5 py-1.5 text-xs ${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md}`,
        `outline-none ${BORDER.inputFocus} transition-all`,
        TEXT.primary,
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'appearance-none bg-no-repeat bg-[right_0.5rem_center] bg-[length:12px] cursor-pointer',
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        paddingRight: '1.5rem',
      }}
    >
      {TIME_OPTIONS.map(t => (
        <option key={t} value={t}>{formatTimeLabel(t)}</option>
      ))}
    </select>
  );
};
