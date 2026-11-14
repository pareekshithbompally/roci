import React from 'react';
import { cn } from './utils';
import { Text } from './text';

/**
 * Canonical list/sidebar row — tight, borderless, truncated, 32px — so every
 * list shares one shape.
 *
 * - `Row` — button row for clickable items (suggestions, citations, nav).
 * - `rowClasses` — same recipe for non-button shells (rows hosting nested buttons).
 * - `actionRowClasses` + `RowAction` — a row whose trailing ⋯ action overlays the
 *   right edge (no reflow) and keeps the row highlighted while its menu is open.
 * - `RowGroupLabel` — muted label above a group of rows ("Recents").
 */
export function rowClasses(selected?: boolean): string {
  return cn(
    'flex w-full h-8 items-center gap-2 rounded-md px-2.5 text-left text-body text-primary transition-colors cursor-pointer min-w-0',
    selected ? 'bg-pressed' : 'hover:bg-hover',
  );
}

export interface RowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Row({ selected, className, type = 'button', ...props }: RowProps) {
  return <button type={type} className={cn(rowClasses(selected), className)} {...props} />;
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
        className,
      )}
      {...props}
    />
  );
}

/** Shell for a row that hosts a `RowAction` (named group + highlight while its menu is open). */
export function actionRowClasses(selected?: boolean): string {
  return cn(rowClasses(selected), 'group/row relative has-[[data-state=open]]:bg-pressed');
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
        'absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted outline-none transition-opacity',
        'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100 hover:bg-pressed',
        className,
      )}
      {...props}
    />
  );
}
