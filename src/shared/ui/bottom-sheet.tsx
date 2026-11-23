import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useCallback, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { cn, dismissKeyboard } from './utils';
import { NO_TOP_INSET, SCRIM } from './recipes';
import { Check, X } from 'lucide-react';
import { IconButton } from './button';
import { Text } from './text';
import { Spinner } from './spinner';
import { UI_CONFIG } from '@config/ui.config';
import { commits, slideOff, useTouchDrag } from './touch-drag';
import { KIT_COPY } from '@config/kitCopy.config';

/** The one iOS sheet surface (BottomSheet, and Dialog / Popover on a phone): rises from the bottom on the iOS curve to half
 *  height, has a grabber, and follows a finger: up grows it tall, down from tall returns it to half, down from half closes
 *  it (each past a distance or a flick, springing back otherwise). */
const SHEET_SURFACE = cn(
  'fixed inset-x-0 bottom-0 z-modal flex flex-col rounded-t-sheet bg-grouped shadow-overlay focus:outline-none',
  'data-[state=open]:animate-rise-show data-[state=closed]:animate-rise-hide',
  'transition-[translate,height,max-height] duration-ios ease-ios data-[dragging]:transition-none',
);

/** Every sheet opens at half height (iOS medium detent) and grows tall (large detent) when dragged up, scrolled or typed in.
 *  `fit`: as tall as its content, up to that height. `full`: exactly that height, for a stack of screens (Settings, so a
 *  pushed page never changes it) or a wide viewer. */
const SIZE = {
  fit: 'max-h-sheet-rest data-[tall]:max-h-sheet',
  full: 'h-sheet-rest data-[tall]:h-sheet',
} as const;

/** A touch inside something already scrolled down, or on a slider (it drags itself), never moves the sheet. */
function ignoresDrag(target: Element, sheet: HTMLElement): boolean {
  if (target.closest('input[type="range"]')) return true;
  for (let el: Element | null = target; el && sheet.contains(el); el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/** The sheet follows a vertical drag. At half height a drag up grows it (it rises with the finger) and becomes tall past a
 *  distance or a flick; a drag down from tall returns it to half; a drag down from half slides it off and closes it with no
 *  second (rise-hide) animation. Short of that, it springs back. */
function useSheetDrag(sheet: HTMLElement | null, tall: boolean, setTall: (tall: boolean) => void, close: () => void, held?: boolean): void {
  const { sheetShare } = UI_CONFIG.gesture;
  const start = useRef(0);
  useTouchDrag(sheet, {
    // Tall, an upward move is the content's scroll; at half height it grows the sheet.
    axis: tall ? 'down' : 'y',
    ignores: (target) => !sheet || ignoresDrag(target, sheet),
    onMove: (dy) => {
      if (!sheet) return;
      if (!sheet.dataset.dragging) start.current = sheet.offsetHeight;
      sheet.dataset.dragging = '';
      if (dy < 0) sheet.style.height = `${start.current - dy}px`;
      else sheet.style.translate = `0 ${dy}px`;
    },
    onEnd: (dy, speed) => {
      if (!sheet) return;
      delete sheet.dataset.dragging;
      sheet.style.height = '';
      const grows = dy < 0 && commits(-dy, -speed, start.current, sheetShare);
      const shrinks = dy > 0 && commits(dy, speed, start.current, sheetShare);
      if (grows || (shrinks && tall)) {
        sheet.style.translate = '';
        setTall(grows);
        return;
      }
      // A held sheet (unsaved edits) springs back from a drag down, as iOS keeps a sheet that would lose them.
      if (!shrinks || held) {
        sheet.style.translate = '';
        return;
      }
      slideOff(sheet, '0 100%', () => {
        sheet.style.animation = 'none';
        close();
      });
    },
  });
}

export interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  ref?: React.Ref<HTMLDivElement>;
  /** Content laid straight into the sheet (a dialog's form, a popover's detail): it scrolls inside the sheet's height
   *  with iOS insets, clear of the grabber above and the home indicator below. */
  padded?: boolean;
  size?: keyof typeof SIZE;
  /** Keeps the height it opened at as its content shrinks (a list being searched). */
  steady?: boolean;
  /** A drag down doesn't close it (unsaved edits); ✕ or the scrim ask through `onOpenChange`. */
  held?: boolean;
}

const PADDED = 'overflow-y-auto overflow-x-hidden px-4 pt-6 pb-sheet-end';

/** A Radix Dialog's content as the iOS sheet; its height is always the kit's (`size`). */
export function SheetContent({ className, ref, padded, size = 'fit', steady, held, children, ...props }: SheetContentProps) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [tall, setTall] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => closeRef.current?.click(), []);
  useSheetDrag(node, tall, setTall, close, held);
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    setNode(el);
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  }, [ref]);
  return (
    <DialogPrimitive.Content
      ref={setRefs}
      data-tall={tall || undefined}
      onScrollCapture={(e) => { if (e.target instanceof Element && e.target.scrollTop > 0) setTall(true); }}
      onFocusCapture={(e) => { if (e.target.matches('input, textarea')) setTall(true); }}
      onAnimationEnd={(e) => {
        if (steady && node && e.target === node) node.style.minHeight = `min(${node.offsetHeight}px, var(--sheet-max))`;
      }}
      className={cn(SHEET_SURFACE, SIZE[size], padded && PADDED, className)}
      {...props}
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-layer-4" />
      {children}
      <DialogPrimitive.Close ref={closeRef} className="sr-only">{KIT_COPY.close}</DialogPrimitive.Close>
    </DialogPrimitive.Content>
  );
}

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sheet's accessible name (read by VoiceOver, not shown). */
  title: string;
  size?: keyof typeof SIZE;
  /** Keeps the height it opened at as its content shrinks (a list being searched). */
  steady?: boolean;
  /** Focus lands in the first field instead of on the sheet (an edit sheet: the caret is already where you type). */
  focusField?: boolean;
  /** A drag down doesn't close it (unsaved edits). */
  held?: boolean;
  children: React.ReactNode;
}

/** iOS sheet over a scrim, portalled above the whole app; a swipe down, the scrim or Escape closes it. */
export function BottomSheet({ open, onOpenChange, title, size, steady, focusField, held, children }: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  // Before the first frame of the rise: the field behind lets go (its own search field may keep focus).
  useLayoutEffect(() => {
    if (open) dismissKeyboard(contentRef.current);
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <SheetContent
          ref={contentRef}
          held={held}
          aria-describedby={undefined}
          // Focus lands on the sheet itself, without scrolling it to a control further down (it opens at its top).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const field = focusField ? contentRef.current?.querySelector<HTMLElement>('input, textarea') : null;
            (field ?? contentRef.current)?.focus({ preventScroll: true });
          }}
          size={size}
          steady={steady}
          className="overflow-hidden pt-3"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className={cn('flex min-h-0 flex-1 flex-col', NO_TOP_INSET)}>{children}</div>
        </SheetContent>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A sheet's scrolling content: groups spaced like a settings list, scrolling to the screen edge with the
 *  home-indicator space as padding at its end (iOS), so nothing stops short above a dead strip. */
export function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-section overflow-y-auto overflow-x-hidden p-4 pb-sheet-end">{children}</div>;
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
