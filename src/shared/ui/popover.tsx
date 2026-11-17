import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { createContext, useContext, type ComponentProps } from 'react';
import { cn } from './utils';
import { FLOATING_SURFACE, NO_INSETS, SCRIM } from './recipes';
import { useFormFactor } from '@platform/formFactor';

/**
 * A popover on a Mac (NSPopover-like, beside its trigger); on a phone a bottom sheet, as iOS presents detail.
 * `anchored` keeps it beside its anchor on a phone too (autocomplete that must stay with the field being typed in).
 */
const AsSheet = createContext(false);

export interface PopoverProps extends ComponentProps<typeof PopoverPrimitive.Root> {
  anchored?: boolean;
}

export function Popover({ anchored, ...props }: PopoverProps) {
  const sheet = useFormFactor() === 'phone' && !anchored;
  return (
    <AsSheet.Provider value={sheet}>
      {sheet ? <DialogPrimitive.Root {...props} /> : <PopoverPrimitive.Root {...props} />}
    </AsSheet.Provider>
  );
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return useContext(AsSheet) ? <DialogPrimitive.Trigger {...props} /> : <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return useContext(AsSheet) ? <>{props.children}</> : <PopoverPrimitive.Anchor {...props} />;
}

export function PopoverClose(props: ComponentProps<typeof PopoverPrimitive.Close>) {
  return useContext(AsSheet) ? <DialogPrimitive.Close {...props} /> : <PopoverPrimitive.Close {...props} />;
}

/** Width lives in a prop: class merging is not available, so a className width would fight the default. */
const WIDTH = {
  sm: 'w-56',
  md: 'w-64',
  lg: 'w-72',
  xl: 'w-80',
  trigger: 'w-[var(--radix-popover-trigger-width)]',
  auto: 'w-auto',
} as const;

export interface PopoverContentProps extends ComponentProps<typeof PopoverPrimitive.Content> {
  width?: keyof typeof WIDTH;
  /** The sheet's name for VoiceOver (phone). */
  label?: string;
}

const PHONE_SHEET = cn(
  'fixed inset-x-0 bottom-0 z-modal flex max-h-[85vh] flex-col overflow-y-auto rounded-t-sheet bg-grouped p-4 pb-[calc(var(--safe-bottom)+1rem)] shadow-overlay focus:outline-none',
  'data-[state=open]:animate-rise-show data-[state=closed]:animate-rise-hide',
);

export function PopoverContent({ className, sideOffset = 4, width = 'lg', label = 'Details', children, ...props }: PopoverContentProps) {
  if (useContext(AsSheet)) {
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content aria-describedby={undefined} className={PHONE_SHEET}>
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <div aria-hidden className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-layer-4" />
          <div className={cn('flex min-h-0 flex-col', NO_INSETS)}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} className={cn(FLOATING_SURFACE, WIDTH[width], className)} {...props}>{children}</PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
