import React from 'react';
import { cn } from './utils';
import { platform } from '@platform/index';

/** Keyboard shortcut badge (⌘K, ⌘L…); not shown on touch screens, which have no shortcuts. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  if (platform.hasTouchScreen) return null;
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

/** A shortcut as macOS shows it: one keycap per key (⌘ K). The one way to draw a shortcut. */
export function Keycaps({ keys }: { keys: readonly string[] }) {
  return <span className="inline-flex items-center gap-1">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span>;
}
