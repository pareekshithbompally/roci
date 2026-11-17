import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useLayoutEffect, useRef } from 'react';
import { cn, dismissKeyboard } from './utils';
import { NO_TOP_INSET, SCRIM } from './recipes';

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
  const contentRef = useRef<HTMLDivElement>(null);
  // Before the first frame of the rise: the field behind lets go (its own search field may keep focus).
  useLayoutEffect(() => {
    if (open) dismissKeyboard(contentRef.current);
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          // Focus lands on the sheet itself, without scrolling it to a control further down (it opens at its top).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-modal flex flex-col overflow-hidden rounded-t-sheet bg-grouped shadow-overlay focus:outline-none',
            'data-[state=open]:animate-rise-show data-[state=closed]:animate-rise-hide',
            SIZE[size],
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-layer-4" />
          <div className={cn('flex min-h-0 flex-1 flex-col', NO_TOP_INSET)}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A sheet's scrolling content: groups spaced like a settings list, scrolling to the screen edge with the
 *  home-indicator space as padding at its end (iOS), so nothing stops short above a dead strip. */
export function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-section overflow-y-auto p-4 pb-sheet-end">{children}</div>;
}
