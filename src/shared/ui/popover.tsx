import * as PopoverPrimitive from '@radix-ui/react-popover';
import React, { createContext, useContext, type ComponentProps } from 'react';
import { Surface } from './surface';
import { Text } from './text';
import { cn } from './utils';
import { FLOATING_SURFACE, NO_INSETS } from './recipes';
import { popFromTrigger } from './pop-origin';
import { useFormFactor } from '@platform/formFactor';
import { SheetContent, SheetRoot } from './bottom-sheet';
import { DialogTrigger } from './dialog';
import { KIT_COPY } from '@config/kitCopy.config';

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
      {sheet ? <SheetRoot {...props} /> : <PopoverPrimitive.Root {...props} />}
    </AsSheet.Provider>
  );
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return useContext(AsSheet) ? <DialogTrigger {...props} /> : <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return useContext(AsSheet) ? <>{props.children}</> : <PopoverPrimitive.Anchor {...props} />;
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


export function PopoverContent({ className, sideOffset = 4, width = 'lg', label = KIT_COPY.details, children, ...props }: PopoverContentProps) {
  if (useContext(AsSheet)) {
    return (
      // The sheet draws its own backdrop and portals itself.
      <SheetContent padded aria-describedby={undefined} label={label}>
        <div className={cn('flex min-h-0 flex-col', NO_INSETS)}>{children}</div>
      </SheetContent>
    );
  }
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cn(FLOATING_SURFACE, WIDTH[width], className)}
        {...props}
        onAnimationStart={(e) => {
          popFromTrigger(e);
          props.onAnimationStart?.(e);
        }}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/** A details popover's heading (a reply's model): its icon, its title, one quiet line. */
export function PopoverHeader({ leading, title, detail }: { leading?: React.ReactNode; title: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {leading}
      <div className="min-w-0">
        <Text as="p" variant="headline" truncate>{title}</Text>
        {detail && <Text as="p" variant="helper" tone="muted">{detail}</Text>}
      </div>
    </div>
  );
}

/** One fact in a details popover, on the glass like a menu's row: its name at the start, its figure at the end. */
export function PopoverFact({ label, value }: { label: string; value: string }) {
  return (
    <Surface edge="top" className="flex items-center justify-between gap-4 px-4 py-2.5">
      <Text>{label}</Text>
      <Text tone="muted" className="tabular-nums">{value}</Text>
    </Surface>
  );
}
