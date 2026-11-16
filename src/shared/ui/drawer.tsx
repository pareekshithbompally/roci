import React from 'react';
import { cn } from './utils';
import { Surface } from './surface';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** The panel's accessible name. */
  label: string;
  /** `end` (default): a panel from the right. `start`: the sidebar from the left (phone). */
  side?: 'start' | 'end';
  children: React.ReactNode;
}

const SIDE = {
  start: { edge: 'right', panel: 'left-0 w-[var(--drawer-start-width)] pt-[var(--safe-top)] pb-[var(--safe-bottom)]', closed: '-translate-x-full' },
  end: { edge: 'left', panel: 'right-0 w-96', closed: 'translate-x-full' },
} as const;

/** A panel that slides in from one edge of its positioned parent over a scrim; the scrim or Escape closes it. */
export function Drawer({ open, onClose, label, side = 'end', children }: DrawerProps) {
  const placement = SIDE[side];
  const closeOnEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  return (
    // Part of the shell (z-10…z-50 band), so it stays under the titlebar strip and sidebar controls.
    <div className={cn('absolute inset-0 z-10', !open && 'pointer-events-none')}>
      <Surface
        variant="scrim"
        aria-hidden="true"
        onClick={onClose}
        className={cn('absolute inset-0 transition-opacity duration-300', !open && 'opacity-0')}
      />
      <Surface
        variant="card"
        edge={placement.edge}
        role="dialog"
        aria-label={label}
        aria-modal="true"
        onKeyDown={closeOnEscape}
        className={cn('absolute inset-y-0 flex flex-col transition-transform duration-300 ease-out', placement.panel, !open && placement.closed)}
      >
        {children}
      </Surface>
    </div>
  );
}
