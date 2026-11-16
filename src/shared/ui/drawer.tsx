import React from 'react';
import { cn } from './utils';
import { Surface } from './surface';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** The panel's accessible name. */
  label: string;
  children: React.ReactNode;
}

/** A panel that slides in from the right edge of its positioned parent over a scrim; the scrim or Escape closes it. */
export function Drawer({ open, onClose, label, children }: DrawerProps) {
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
        edge="left"
        role="dialog"
        aria-label={label}
        aria-modal="true"
        onKeyDown={closeOnEscape}
        className={cn('absolute inset-y-0 right-0 flex w-96 flex-col transition-transform duration-300 ease-out', !open && 'translate-x-full')}
      >
        {children}
      </Surface>
    </div>
  );
}
