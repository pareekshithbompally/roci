import React from 'react';
import { Surface } from './surface';
import { Text } from './text';

export interface TopBarProps {
  /** Control at the start: sidebar toggle or back. */
  leading?: React.ReactNode;
  /** Centred: a string becomes the bar title; any node (model picker) renders as is. */
  title?: React.ReactNode;
  /** Actions at the end. */
  trailing?: React.ReactNode;
}

/** iOS 26 navigation bar: clear, below the status bar; round bar buttons at the sides, the title centred whatever they hold. */
export function TopBar({ leading, title, trailing }: TopBarProps) {
  return (
    <Surface as="header" variant="plain" className="sticky top-0 z-20 shrink-0 pt-safe-top">
      <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-1">
        <div className="flex items-center gap-1 justify-self-start">{leading}</div>
        <div className="min-w-0 justify-self-center">
          {typeof title === 'string' ? <Text as="h1" variant="bodyStrong" className="truncate">{title}</Text> : title}
        </div>
        <div className="flex items-center gap-1 justify-self-end">{trailing}</div>
      </div>
    </Surface>
  );
}
