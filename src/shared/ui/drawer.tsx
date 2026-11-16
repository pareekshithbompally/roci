import React from 'react';
import { cn } from './utils';
import { Surface } from './surface';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** The panel's accessible name. */
  label: string;
  /** `end` (default): a panel from the right. `start`: the sidebar from the left (phone). `bottom`: a sheet (phone). */
  side?: 'start' | 'end' | 'bottom';
  children: React.ReactNode;
}

/** `layer`: a side panel stays in the shell band; the phone sidebar and sheet cover the whole shell, top bar included. */
const SIDE = {
  start: { layer: 'z-50', edge: 'right', panel: 'inset-y-0 left-0 w-[var(--drawer-start-width)] pt-safe-top pb-safe-bottom', closed: '-translate-x-full' },
  end: { layer: 'z-10', edge: 'left', panel: 'inset-y-0 right-0 w-96', closed: 'translate-x-full' },
  bottom: { layer: 'z-50', edge: 'top', panel: 'inset-x-0 bottom-0 top-safe-top mt-2 rounded-t-2xl pb-safe-bottom', closed: 'translate-y-full' },
} as const;

/** The panel already clears the notch and home bar, so its content sees no safe-area insets. */
const NO_INSETS = '[--safe-top:0px] [--safe-bottom:0px]';

/** A panel that slides in from one edge of its positioned parent over a scrim; the scrim or Escape closes it. */
export function Drawer({ open, onClose, label, side = 'end', children }: DrawerProps) {
  const placement = SIDE[side];
  const closeOnEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  return (
    <div className={cn('absolute inset-0', placement.layer, !open && 'pointer-events-none')}>
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
        className={cn('absolute flex flex-col overflow-hidden transition-transform duration-300 ease-out', placement.panel, !open && placement.closed)}
      >
        <div className={cn('flex min-h-0 flex-1 flex-col', NO_INSETS)}>{children}</div>
      </Surface>
    </div>
  );
}
