import React from 'react';
import { cn } from './utils';
import { Surface } from './surface';
import { Text } from './text';

export interface TopBarProps {
  /** Control at the start: sidebar toggle or back. */
  leading?: React.ReactNode;
  /** Centred: a string becomes the bar title; any node (model picker) renders as is. */
  title?: React.ReactNode;
  /** Actions at the end. */
  trailing?: React.ReactNode;
  className?: string;
}

/** iOS navigation bar: translucent, below the status bar, 44 pt tall; the title stays centred whatever the sides hold. */
export function TopBar({ leading, title, trailing, className }: TopBarProps) {
  return (
    <Surface as="header" variant="panel" edge="bottom" className={cn('sticky top-0 z-20 shrink-0 pt-safe-top', className)}>
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
        <div className="flex items-center gap-1 justify-self-start">{leading}</div>
        <div className="min-w-0 justify-self-center">
          {typeof title === 'string' ? <Text as="h1" variant="bodyStrong" className="truncate">{title}</Text> : title}
        </div>
        <div className="flex items-center gap-1 justify-self-end">{trailing}</div>
      </div>
    </Surface>
  );
}
