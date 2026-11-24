import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { cn, dismissKeyboard } from './utils';
import { NO_TOP_INSET } from './recipes';
import { Check, X } from 'lucide-react';
import { IconButton } from './button';
import { Text } from './text';
import { Spinner } from './spinner';
import { UI_CONFIG } from '@config/ui.config';
import { KIT_COPY } from '@config/kitCopy.config';

/**
 * The one iOS sheet (BottomSheet, and Dialog / Popover on a phone). react-modal-sheet moves it: it follows the finger 1:1 and
 * settles at a stop (or closes) by distance and speed, with resistance past full. A `fit` sheet stops only at its own height
 * (a short one sits on the bottom edge); a `full` one at half the screen, where a push on the content lifts it, and full. At
 * its top stop the content scrolls, and a pull down from the top of whichever scroller is under the finger lowers it.
 * Radix keeps it a dialog: focus stays inside, Escape and a tap outside close it, VoiceOver reads its name. Every close
 * animates out before Radix lets go.
 */

/** `fit`: as tall as its content, up to full; it opens at that height. `full`: the full height, for a stack of screens
 *  (Settings: a pushed page never changes it) or a wide viewer; it opens at half the screen. */
type SheetSize = 'fit' | 'full';
const DETENT = { fit: 'content', full: 'default' } as const;

/** A sheet's stops, react-modal-sheet's way (ascending; above 1 is px from the bottom; 1 is the sheet's full height): closed,
 *  then (`full` only) half the screen, then its full height. It opens at the first stop above closed. */
const stopsOf = (size: SheetSize): number[] =>
  (size === 'fit' ? [0, 1] : [0, Math.round(window.innerHeight * UI_CONFIG.sheet.restShare), 1]);
const OPEN = 1;
/** The index of a sheet's top stop, where its content scrolls. */
const TOP = { fit: 1, full: 2 } as const;

const SURFACE = 'rounded-t-sheet bg-grouped shadow-overlay';

/** A sheet's own scrollers (a stack's pages, a picker's list) scroll only at its top stop; below it the push moves the sheet. */
const SheetScrollsContext = createContext(true);
/** Whether a scroller inside a sheet may scroll now (true outside any sheet). */
export const useSheetScrolls = () => useContext(SheetScrollsContext);

/** Told whether the scroller in use inside a sheet rests at its top (null outside a sheet). */
const SheetPullContext = createContext<((atTop: boolean) => void) | null>(null);

/** For a scroller inside a sheet, run on mount and on every scroll: at its top a pull down moves the sheet (the finger's
 *  downward pan is left to the sheet, as the library does for its own scroller); scrolled, the sheet holds still. A no-op
 *  outside a sheet. */
export function useSheetPull(): (scroller: HTMLElement | null) => void {
  const report = useContext(SheetPullContext);
  return useCallback((scroller: HTMLElement | null) => {
    if (!report || !scroller) return;
    const atTop = scroller.scrollTop <= 0;
    scroller.style.touchAction = atTop ? 'pan-down' : '';
    report(atTop);
  }, [report]);
}

interface SheetFrameProps {
  open: boolean;
  /** The user closed it (a swipe down, ✕, a tap outside, Escape). */
  onClose: () => void;
  /** Its close animation ended. */
  onClosed?: () => void;
  size: SheetSize;
  /** A swipe down doesn't close it (unsaved edits); ✕ asks through `onClose`. */
  held?: boolean;
  children: React.ReactNode;
}

/** The moving parts: the sheet, its surface and its backdrop; `children` is the Radix dialog inside it. */
function SheetFrame({ open, onClose, onClosed, size, held, children }: SheetFrameProps) {
  const reduce = useReducedMotion() ?? false;
  const [full, setFull] = useState(false);
  const snapPoints = useMemo(() => stopsOf(size), [open, size]);
  return (
    <Sheet
      isOpen={open}
      onClose={onClose}
      onCloseEnd={() => {
        setFull(false);
        onClosed?.();
      }}
      detent={DETENT[size]}
      snapPoints={snapPoints}
      initialSnap={OPEN}
      onSnap={(index) => setFull(index === TOP[size])}
      disableDismiss={held}
      // Radix locks the page; the keyboard is cleared by --safe-bottom (tokens.css), which the native view keeps in step.
      disableScrollLocking
      avoidKeyboard={false}
      prefersReducedMotion={reduce}
      tweenConfig={UI_CONFIG.sheet.tween}
      unstyled
      // The app's modal layer (tokens.css), under popovers and menus opened from inside the sheet (the library's own is 9999).
      style={{ zIndex: 'var(--z-modal)' }}
    >
      <Sheet.Container className={SURFACE}>
        <SheetScrollsContext.Provider value={full}>{children}</SheetScrollsContext.Provider>
      </Sheet.Container>
      <Sheet.Backdrop className="bg-scrim" />
    </Sheet>
  );
}

/** The grabber, then the content: below the top stop a push lifts the sheet; at it the content scrolls (its own scroller,
 *  or the sheet's) and a pull down from a scroller's top lowers the sheet; a field taking focus brings the sheet to its top
 *  stop, above the keyboard. */
function SheetBodyFrame({ padded, size, children }: { padded?: boolean; size: SheetSize; children: React.ReactNode }) {
  const { snapTo } = Sheet.useContext();
  // Whether the inner scroller in use (a stack's page, a picker's list) rests at its top: only then may its content drag.
  const [pullable, setPullable] = useState(true);
  const top = TOP[size];
  return (
    <>
      <Sheet.Header className="flex shrink-0 justify-center pt-1.5 pb-1">
        <span aria-hidden className="h-1 w-9 rounded-full bg-layer-4" />
      </Sheet.Header>
      <Sheet.Content
        className="flex min-h-0 flex-1 flex-col"
        scrollClassName={cn('flex min-h-0 flex-1 flex-col', padded && 'px-4 pt-4 pb-sheet-end')}
        disableScroll={({ currentSnap }) => currentSnap !== top}
        disableDrag={({ currentSnap }) => currentSnap === top && !pullable}
        onFocusCapture={(e: React.FocusEvent) => {
          if (e.target instanceof Element && e.target.matches('input, textarea')) snapTo(top);
        }}
      >
        <SheetPullContext.Provider value={setPullable}>
          <div className={cn('flex min-h-0 flex-1 flex-col', NO_TOP_INSET)}>{children}</div>
        </SheetPullContext.Provider>
      </Sheet.Content>
    </>
  );
}

export interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  ref?: React.Ref<HTMLDivElement>;
  /** Content laid straight into the sheet (a dialog's form, a popover's detail), with iOS insets. */
  padded?: boolean;
  size?: SheetSize;
  /** A swipe down doesn't close it (unsaved edits). */
  held?: boolean;
}

const DIALOG = 'flex min-h-0 flex-1 flex-col outline-none';

/** A Radix Dialog's content as the sheet (a Dialog or Popover on a phone: the caller owns the open state). It animates out,
 *  then tells Radix. */
export function SheetContent({ className, ref, padded, size = 'fit', held, children, onPointerDownOutside, onEscapeKeyDown, ...props }: SheetContentProps) {
  const [open, setOpen] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <SheetFrame open={open} onClose={close} onClosed={() => closeRef.current?.click()} size={size} held={held}>
      <DialogPrimitive.Content
        ref={ref}
        className={cn(DIALOG, className)}
        onPointerDownOutside={(e) => {
          onPointerDownOutside?.(e);
          e.preventDefault();
          if (!held) close();
        }}
        onEscapeKeyDown={(e) => {
          onEscapeKeyDown?.(e);
          e.preventDefault();
          close();
        }}
        {...props}
      >
        <SheetBodyFrame padded={padded} size={size}>{children}</SheetBodyFrame>
        <DialogPrimitive.Close ref={closeRef} className="sr-only">{KIT_COPY.close}</DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetFrame>
  );
}

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sheet's accessible name (read by VoiceOver, not shown). */
  title: string;
  size?: SheetSize;
  /** Focus lands in the first field instead of on the sheet (an edit sheet: the caret is already where you type). */
  focusField?: boolean;
  /** A swipe down doesn't close it (unsaved edits). */
  held?: boolean;
  children: React.ReactNode;
}

/** iOS sheet over a dimmed page; a swipe down, a tap outside, ✕ or Escape closes it. */
export function BottomSheet({ open, onOpenChange, title, size = 'fit', focusField, held, children }: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  // Radix stays open until the sheet's close animation ends.
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  // Before the first frame of the rise: the field behind lets go (its own search field may keep focus).
  useLayoutEffect(() => {
    if (open) dismissKeyboard(contentRef.current);
  }, [open]);
  return (
    <DialogPrimitive.Root open={shown} onOpenChange={(next) => !next && onOpenChange(false)}>
      <SheetFrame open={open} onClose={() => onOpenChange(false)} onClosed={() => setShown(false)} size={size} held={held}>
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          className={DIALOG}
          onPointerDownOutside={(e) => {
            if (held) e.preventDefault();
          }}
          // Focus lands on the sheet itself, without scrolling it to a control further down (it opens at its top).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const field = focusField ? contentRef.current?.querySelector<HTMLElement>('input, textarea') : null;
            (field ?? contentRef.current)?.focus({ preventScroll: true });
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <SheetBodyFrame size={size}>{children}</SheetBodyFrame>
        </DialogPrimitive.Content>
      </SheetFrame>
    </DialogPrimitive.Root>
  );
}

/** A sheet's content: groups spaced like a settings list, the home-indicator space (and the keyboard) as padding at its end
 *  (iOS); the sheet scrolls it at full height. */
export function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-section p-4 pb-sheet-end">{children}</div>;
}

export interface EditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** ✓ is greyed until there is something to save. */
  canSave: boolean;
  onSave: () => void;
  /** What ✓ does (Save, Add, Done), for VoiceOver. */
  saveLabel?: string;
  /** Saving: a spinner stands in for ✓. */
  busy?: boolean;
  /** Edited: a drag down keeps it open, so only ✕ (which asks) or ✓ leave. */
  held?: boolean;
  children: React.ReactNode;
}

/** A sheet's bar (iOS), the title centred. One rule for every sheet: one that edits has ✕ (cancel) at the leading edge and
 *  its save (`trailing`) at the trailing edge; one that only shows or picks has ✕ alone at the trailing edge, as Settings does. */
function SheetHeader({ title, closeLabel, onClose, trailing }: { title: string; closeLabel: string; onClose: () => void; trailing?: React.ReactNode }) {
  const close = <IconButton icon={X} label={closeLabel} size="fab" variant="bar" onClick={onClose} />;
  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-2">
      <div className="justify-self-start">{trailing && close}</div>
      <Text as="h2" variant="headline">{title}</Text>
      <div className="justify-self-end">{trailing ?? close}</div>
    </header>
  );
}

/** An iOS edit sheet (Settings › Name): ✕ cancels at the leading edge, ✓ saves at the trailing edge, the title between;
 *  the fields below in their own card, no buttons in the content. */
export function EditSheet({ open, onOpenChange, title, canSave, onSave, saveLabel = KIT_COPY.save, busy, held, children }: EditSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} focusField held={held}>
      <SheetHeader
        title={title}
        closeLabel={KIT_COPY.cancel}
        onClose={() => onOpenChange(false)}
        trailing={busy ? <Spinner /> : <IconButton icon={Check} label={saveLabel} size="fab" variant="bar" disabled={!canSave} onClick={onSave} />}
      />
      <SheetBody>{children}</SheetBody>
    </BottomSheet>
  );
}

export interface InfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

/** A sheet you look at (Activity): as tall as its content, ✕ and the title in its bar, grouped cards below. */
export function InfoSheet({ open, onOpenChange, title, children }: InfoSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <SheetHeader title={title} closeLabel={KIT_COPY.close} onClose={() => onOpenChange(false)} />
      <SheetBody>{children}</SheetBody>
    </BottomSheet>
  );
}
