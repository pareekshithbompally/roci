import * as DialogPrimitive from '@radix-ui/react-dialog';
import React from 'react';
import { cn } from './utils';
import { TitlebarSpacer } from './page-scroll';
import { Surface } from './surface';
import { NO_INSETS } from './recipes';
import { BottomSheet } from './bottom-sheet';
import { useFormFactor } from '@platform/formFactor';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** The panel's accessible name. */
  label: string;
  /** `end` (default): a panel from the right. `start`: the sidebar from the left (phone, narrow windows). */
  side?: 'start' | 'end';
  children: React.ReactNode;
}

/**
 * `modal`: the sidebar takes over (focus trapped, the rest hidden from VoiceOver, an outside tap closes it); a side panel
 * leaves the app usable. `layer`: a side panel stays in the shell band; the sidebar covers the whole shell, top bar included.
 */
const SIDE = {
  start: {
    modal: true,
    layer: 'z-50',
    edge: 'right',
    panel: 'inset-y-0 left-0 w-[var(--drawer-start-width)] pt-safe-top pb-safe-bottom',
    motion: 'data-[state=open]:animate-drawer-start-show data-[state=closed]:animate-drawer-start-hide',
  },
  end: {
    modal: false,
    layer: 'z-10',
    edge: 'left',
    panel: 'inset-y-0 right-0 w-96',
    motion: 'data-[state=open]:animate-drawer-end-show data-[state=closed]:animate-drawer-end-hide',
  },
} as const;

/**
 * A panel that slides in from one edge of its positioned parent over a scrim (Radix Dialog, not portalled); the scrim or
 * Escape closes it. On a phone a side panel (`end`: sources, details) is a bottom sheet, as iOS presents detail.
 */
export function Drawer({ open, onClose, label, side = 'end', children }: DrawerProps) {
  const phone = useFormFactor() === 'phone';
  if (phone && side === 'end') {
    return <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title={label}>{children}</BottomSheet>;
  }
  const placement = SIDE[side];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()} modal={placement.modal}>
      <div className={cn('absolute inset-0', placement.layer, !open && 'pointer-events-none')}>
        <Surface
          variant="scrim"
          aria-hidden="true"
          onClick={onClose}
          className={cn('absolute inset-0 transition-opacity duration-300', !open && 'opacity-0')}
        />
        <DialogPrimitive.Content
          asChild
          aria-describedby={undefined}
          // A side panel lets the rest of the app keep working; only its scrim or Escape closes it.
          onInteractOutside={placement.modal ? undefined : (e) => e.preventDefault()}
        >
          <Surface variant="card" edge={placement.edge} className={cn('absolute flex flex-col overflow-hidden', placement.panel, placement.motion)}>
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            {/* Mac: the panel's header starts below the titlebar drag strip (which sits above it), as every page does. */}
            {side === 'end' && <TitlebarSpacer />}
            <div className={cn('flex min-h-0 flex-1 flex-col', NO_INSETS)}>{children}</div>
          </Surface>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Root>
  );
}
