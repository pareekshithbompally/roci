import * as DialogPrimitive from '@radix-ui/react-dialog';
import React from 'react';
import { cn } from './utils';
import { NO_INSETS, SCRIM } from './recipes';

/** `auto`: as tall as its content (action sheets). `full`: the whole screen below the status bar (Settings). */
const SIZE = {
  auto: 'max-h-[85vh]',
  full: 'top-safe-top mt-2',
} as const;

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sheet's accessible name (read by VoiceOver, not shown). */
  title: string;
  size?: keyof typeof SIZE;
  children: React.ReactNode;
}

/** iOS sheet: rises from the bottom over a scrim, with a grabber; the scrim or Escape closes it. Portalled above the whole app. */
export function BottomSheet({ open, onOpenChange, title, size = 'auto', children }: BottomSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-modal flex flex-col overflow-hidden rounded-t-2xl bg-base pb-safe-bottom shadow-overlay focus:outline-none',
            'data-[state=open]:animate-rise-show data-[state=closed]:animate-rise-hide',
            SIZE[size],
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-layer-4" />
          <div className={cn('flex min-h-0 flex-1 flex-col', NO_INSETS)}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
