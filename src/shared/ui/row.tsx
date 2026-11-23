import React from 'react';
import { cn } from './utils';
import { Text } from './text';
import { platform } from '@platform/index';

/** Canonical list/sidebar row (control-md: 32 px on macOS, 44 pt on iOS) (Row, rowClasses, RowAction, RowGroupLabel) so every list shares one shape. */
/** `md`: one-line rows (sidebar, menus); `lg`: a title over a detail line with room around it (Mail / Notes lists). */
export type RowSize = 'md' | 'lg';

const ROW_PADDING: Record<RowSize, string> = { md: 'py-1', lg: 'py-2' };

export function rowClasses(selected?: boolean, size: RowSize = 'md'): string {
  return cn(
    'flex w-full min-h-control-md items-center gap-2 rounded-md px-2.5 text-left text-body text-primary transition-colors cursor-pointer min-w-0',
    ROW_PADDING[size],
    selected ? 'bg-pressed' : 'hover:bg-hover',
    // Touch: a list row shades while the finger is on it (UITableView highlight).
    platform.hasTouchScreen && 'active:bg-pressed',
  );
}

export interface RowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  size?: RowSize;
  /** An icon on the text's first line, however many lines the text wraps to. */
  leading?: React.ReactNode;
}

export function Row({ selected, size, leading, className, type = 'button', children, ...props }: RowProps) {
  return (
    <button type={type} className={cn(rowClasses(selected, size), className)} {...props}>
      {leading ? (
        // Icon and text are one group the row centres; inside it the icon's box is one text line tall (1lh), so it
        // sits on the first line wherever the row places the text.
        <span className="flex min-w-0 flex-1 items-start gap-2">
          <span className="flex h-[1lh] shrink-0 items-center empty:hidden">{leading}</span>
          <span className="min-w-0 flex-1">{children}</span>
        </span>
      ) : children}
    </button>
  );
}

export function RowGroupLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text as="div" variant="label" tone="faint" className={cn('px-2 pt-3 pb-1', className)}>
      {children}
    </Text>
  );
}

/** Row title that fades out under the trailing action instead of reflowing. */
export function RowTitle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'flex-1 min-w-0 truncate',
        // Literal strings: Tailwind only generates classes it can read verbatim.
        'group-hover/row:[mask-image:linear-gradient(to_left,transparent_28px,black_48px)]',
        'group-focus-within/row:[mask-image:linear-gradient(to_left,transparent_28px,black_48px)]',
        'group-has-[[data-state=open]]/row:[mask-image:linear-gradient(to_left,transparent_28px,black_48px)]',
        // Touch has no hover: the row action is always shown, so the title always fades before it.
        platform.hasTouchScreen && '[mask-image:linear-gradient(to_left,transparent_28px,black_48px)]',
        className,
      )}
      {...props}
    />
  );
}

/** Touch screens have no hover: what a row reveals stays visible there. */
const REVEAL = platform.hasTouchScreen ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100';

/** Shell for a row that hosts a `RowAction` (named group + highlight while its menu is open). */
export function actionRowClasses(selected?: boolean): string {
  return cn(rowClasses(selected), 'group/row relative has-[[data-state=open]]:bg-pressed');
}

export interface HoverRevealProps {
  /** Shown without hover (an active reminder). */
  always?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** A row's controls (inside a `group/row`): shown on hover and focus; touch screens have no hover, so always there. */
export function HoverReveal({ always, className, children }: HoverRevealProps) {
  return <div className={cn('shrink-0 transition-opacity', !always && REVEAL, className)}>{children}</div>;
}

export interface RowActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: React.Ref<HTMLButtonElement>;
}

/** Trailing icon button of an action row; shown on hover/focus and while its menu is open. */
export function RowAction({ className, type = 'button', ref, ...props }: RowActionProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'absolute right-1 top-1/2 -translate-y-1/2 flex h-control-xs w-control-xs items-center justify-center rounded-md text-muted outline-none transition-opacity',
        REVEAL,
        'hover:bg-pressed',
        platform.hasTouchScreen && 'active:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
