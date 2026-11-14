import React from 'react';
import { cn } from './utils';

/** Keyboard shortcut badge (⌘K, ⌘L…). */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 h-5 px-1.5 rounded bg-layer-2 text-faint text-subheadline font-medium font-sans',
        className,
      )}
      {...props}
    />
  );
}
