import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { SheetTweenConfig } from 'react-modal-sheet';
import { spring } from './motion';
import { Sheet } from 'react-modal-sheet';
import { cn, dismissKeyboard } from './utils';
import { NO_TOP_INSET } from './recipes';
import { useSheetPullDown } from './bottom-sheet-pull';
import { X } from 'lucide-react';
import { IconButton } from './button';
import { Text } from './text';
import { UI_CONFIG } from '@config/ui.config';
import { KIT_COPY } from '@config/kitCopy.config';

/**
 * The one iOS sheet. Every sheet on a phone is this: BottomSheet, InfoSheet, and a Dialog or Popover (their
 * roots are `SheetRoot` there). One contract: the grabber and the sheet's bar (✕, title, ✓) hold still at the top and drag
 * the sheet; the content under them scrolls. react-modal-sheet moves it: it follows the finger 1:1 and settles at a stop (or
 * closes) by distance and speed. A `fit` sheet stops only at its own height (a short one sits on the bottom edge); a `full`
 * one at half the screen, where a push on the content lifts it, and full. At its top stop the content scrolls natively and
 * a pull down from the top of what scrolls lowers it (bottom-sheet-pull.ts). Radix keeps it a dialog: focus stays inside,
 * Escape and a tap outside close it, VoiceOver reads its name. Every close animates out before Radix lets go.
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
/** Opens, closes and settles on the `follow` spring, from the finger's speed: the library spreads this over its own
 *  `type: 'tween'`, and its `y` tracks the drag's velocity, so a release carries on instead of restarting. */
const SHEET_MOTION = spring('follow') as unknown as SheetTweenConfig;
/** The index of a sheet's top stop, where its content scrolls. */
const TOP = { fit: 1, full: 2 } as const;

/** Its corners clip what's inside (a page's opaque background never squares them off). */
const SURFACE = 'overflow-hidden rounded-t-sheet bg-grouped shadow-overlay';

/** A sheet's own scrollers (a stack's pages, a picker's list) scroll only at its top stop; below it the push moves the sheet. */
const SheetScrollsContext = createContext(true);
/** Whether a scroller inside a sheet may scroll now (true outside any sheet). */
export const useSheetScrolls = () => useContext(SheetScrollsContext);

/** What a sheet's root tells its content: whether it is asked to show, and how its close runs. */
interface SheetState {
  open: boolean;
  /** The user (or the caller) closed it; the sheet animates out. */
  close: () => void;
  /** Its close animation ended: Radix lets go. */
  closed: () => void;
  /** A sheet frame is drawn for this root (content that isn't a sheet closes at once). */
  register: () => () => void;
}
const SheetStateContext = createContext<SheetState | null>(null);

function useSheetState(): SheetState {
  const state = useContext(SheetStateContext);
  if (!state) throw new Error('[BottomSheet] SheetContent needs a SheetRoot (BottomSheet, or Dialog / Popover on a phone)');
  return state;
}

/** A Radix Dialog root whose content is the sheet: open or closed by its caller (controlled) or its trigger, and kept open
 *  for Radix until the sheet's close animation ends. */
export function SheetRoot({ open: asked, defaultOpen = false, onOpenChange, children, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  const [own, setOwn] = useState(defaultOpen);
  const open = asked ?? own;
  const [shown, setShown] = useState(open);
  const frames = useRef(0);
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  const state = useMemo<SheetState>(() => ({
    open,
    close: () => {
      if (asked === undefined) setOwn(false);
      onOpenChange?.(false);
      if (frames.current === 0) setShown(false);
    },
    closed: () => setShown(false),
    register: () => {
      frames.current += 1;
      return () => { frames.current -= 1; };
    },
  }), [open, asked, onOpenChange]);
  const change = (next: boolean) => {
    if (!next) {
      state.close();
      return;
    }
    if (asked === undefined) setOwn(true);
    onOpenChange?.(true);
  };
  return (
    <SheetStateContext.Provider value={state}>
      <DialogPrimitive.Root {...props} open={shown} onOpenChange={change}>{children}</DialogPrimitive.Root>
    </SheetStateContext.Provider>
  );
}

interface SheetFrameProps {
  state: SheetState;
  size: SheetSize;
  /** A swipe down doesn't close it (unsaved edits); ✕ asks through `close`. */
  held?: boolean;
  children: React.ReactNode;
}

/** The moving parts: the sheet, its surface and its backdrop; `children` is the Radix dialog inside it. */
function SheetFrame({ state, size, held, children }: SheetFrameProps) {
  const reduce = useReducedMotion() ?? false;
  const [full, setFull] = useState(false);
  const { open, close, closed, register } = state;
  const snapPoints = useMemo(() => stopsOf(size), [open, size]);
  useEffect(register, [register]);
  return (
    <Sheet
      isOpen={open}
      onClose={close}
      onCloseEnd={() => {
        setFull(false);
        closed();
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
      tweenConfig={SHEET_MOTION}
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

interface SheetBodyFrameProps {
  bar?: React.ReactNode;
  padded?: boolean;
  size: SheetSize;
  held?: boolean;
  children: React.ReactNode;
}

/** The grabber and the bar, fixed (they drag the sheet), then the content: below the top stop a push on it lifts the sheet;
 *  at the top stop it scrolls, and a pull down from its top lowers the sheet; a field taking focus brings the sheet to its
 *  top stop, above the keyboard. */
function SheetBodyFrame({ bar, padded, size, held = false, children }: SheetBodyFrameProps) {
  const { snapTo } = Sheet.useContext();
  const top = TOP[size];
  const pullRef = useSheetPullDown(top, held);
  return (
    <>
      <Sheet.Header className="flex shrink-0 flex-col">
        <span className="flex justify-center pt-1.5 pb-1">
          <span aria-hidden className="h-1 w-9 rounded-full bg-layer-4" />
        </span>
        {bar}
      </Sheet.Header>
      <Sheet.Content
        ref={pullRef}
        className="flex min-h-0 flex-1 flex-col"
        scrollClassName={cn('flex min-h-0 flex-1 flex-col', padded && 'px-4 pt-4 pb-sheet-end')}
        disableScroll={({ currentSnap }) => currentSnap !== top}
        // At the top stop the content is the page's to scroll; the pull down is ours (useSheetPullDown), not the library's.
        disableDrag={({ currentSnap }) => currentSnap === top}
        onFocusCapture={(e: React.FocusEvent) => {
          if (e.target instanceof Element && e.target.matches('input, textarea')) snapTo(top);
        }}
      >
        <div className={cn('flex min-h-0 flex-1 flex-col', NO_TOP_INSET)}>{children}</div>
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
  /** The sheet's name for VoiceOver, when nothing inside it is a DialogTitle. */
  label?: string;
  /** The sheet's bar (SheetBar): under the grabber, it holds still while the content scrolls. */
  bar?: React.ReactNode;
  /** Focus lands in the first field instead of on the sheet (an edit sheet: the caret is already where you type). */
  focusField?: boolean;
}

const DIALOG = 'flex min-h-0 flex-1 flex-col outline-none';

/** The sheet under a SheetRoot: it animates out, then tells Radix. */
export function SheetContent({ className, ref, padded, size = 'fit', held, label, bar, focusField, children, onPointerDownOutside, onEscapeKeyDown, onOpenAutoFocus, ...props }: SheetContentProps) {
  const state = useSheetState();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  // Before the first frame of the rise: the field behind lets go (its own search field may keep focus).
  useLayoutEffect(() => {
    if (state.open) dismissKeyboard(contentRef.current);
  }, [state.open]);
  return (
    <SheetFrame state={state} size={size} held={held}>
      <DialogPrimitive.Content
        {...props}
        ref={setRef}
        className={cn(DIALOG, className)}
        onPointerDownOutside={(e) => {
          onPointerDownOutside?.(e);
          e.preventDefault();
          if (!held) state.close();
        }}
        onEscapeKeyDown={(e) => {
          onEscapeKeyDown?.(e);
          e.preventDefault();
          state.close();
        }}
        // Focus lands on the sheet itself, without scrolling it to a control further down (it opens at its top).
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e);
          e.preventDefault();
          const field = focusField ? contentRef.current?.querySelector<HTMLElement>('input, textarea') : null;
          (field ?? contentRef.current)?.focus({ preventScroll: true });
        }}
      >
        {label && <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>}
        <SheetBodyFrame bar={bar} padded={padded} size={size} held={held}>{children}</SheetBodyFrame>
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
  /** The sheet's bar, held still above the scrolling content. */
  bar?: React.ReactNode;
  children: React.ReactNode;
}

/** iOS sheet over a dimmed page; a swipe down, a tap outside, ✕ or Escape closes it. */
export function BottomSheet({ open, onOpenChange, title, size = 'fit', focusField, held, bar, children }: BottomSheetProps) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined} label={title} size={size} focusField={focusField} held={held} bar={bar}>
        {children}
      </SheetContent>
    </SheetRoot>
  );
}

/** A sheet's content: groups spaced like a settings list, the home-indicator space (and the keyboard) as padding at its end
 *  (iOS); the sheet scrolls it at full height. */
export function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-section p-4 pb-sheet-end">{children}</div>;
}

/** A sheet's bar (iOS), the title centred. One rule for every sheet: one that edits has ✕ (cancel) at the leading edge and
 *  its save (`trailing`) at the trailing edge; one that only shows or picks has ✕ alone at the trailing edge, as Settings does. */
function SheetHeader({ title, closeLabel, onClose, trailing }: { title: string; closeLabel: string; onClose: () => void; trailing?: React.ReactNode }) {
  const close = <IconButton icon={X} label={closeLabel} size="fab" variant="bar" onClick={onClose} />;
  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-2">
      <div className="justify-self-start">{trailing && close}</div>
      <Text as="h2" variant="headline">{title}</Text>
      <div className="justify-self-end">{trailing ?? close}</div>
    </header>
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
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} bar={<SheetHeader title={title} closeLabel={KIT_COPY.close} onClose={() => onOpenChange(false)} />}>
      <SheetBody>{children}</SheetBody>
    </BottomSheet>
  );
}
