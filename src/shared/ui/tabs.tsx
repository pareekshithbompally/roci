import React from 'react';
import { cn } from './utils';

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
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
export function Tabs<T extends string>({ items, value, onValueChange, fill, label, className }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('items-center gap-0.5 p-0.5 rounded-md bg-layer-2', fill ? 'flex w-full' : 'inline-flex', className)}>
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
              'h-control-xs px-3 rounded text-callout font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus',
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
