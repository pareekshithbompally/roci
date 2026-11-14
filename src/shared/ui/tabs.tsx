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
  className?: string;
}

/** macOS segmented control: inset track, the active segment lifts. */
export function Tabs<T extends string>({ items, value, onValueChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-0.5 p-0.5 rounded-md bg-layer-2', className)}>
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
              'h-6 px-3 rounded text-callout font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus',
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
