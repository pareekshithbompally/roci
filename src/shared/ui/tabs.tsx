import React from 'react';
import { cn } from './utils';
import { useFormFactor } from '@platform/formFactor';

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  /** The label as plain text where only text can show (the system menu on a phone); defaults to `label` when it is text. */
  text?: string;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: NoInfer<T>) => void;
  /** Stretch to the container, segments sharing the width equally (a phone's full-width control). */
  fill?: boolean;
  /** Accessible name of the control (what it chooses: "Theme"). */
  label?: string;
  className?: string;
}

/** Segmented control (macOS and iOS): inset track, the active segment lifts; height follows the platform control scale. */
export function Tabs<T extends string>({ items, value, onValueChange, fill: fillProp, label, className }: TabsProps<T>) {
  // iOS segmented controls span the width of their row; macOS ones hug their segments, even in a column that stretches its items.
  const phone = useFormFactor() === 'phone';
  const fill = fillProp ?? phone;
  return (
    <div role="tablist" aria-label={label} className={cn('items-center gap-0.5 p-0.5 rounded-full bg-control', fill ? 'flex w-full' : 'inline-flex w-fit', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'h-control-xs px-3 rounded-full text-callout font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus',
              fill && 'flex-1',
              active ? 'bg-base text-primary shadow-raised' : 'text-muted hover:text-primary',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
