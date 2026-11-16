import React from 'react';
import { cn } from './utils';
import { Text } from './text';

/** Canonical 32px list/sidebar row (Row, rowClasses, RowAction, RowGroupLabel) so every list shares one shape. */
export function rowClasses(selected?: boolean): string {
  return cn(
    'flex w-full h-control-md items-center gap-2 rounded-md px-2.5 text-left text-body text-primary transition-colors cursor-pointer min-w-0',
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
        'absolute right-1 top-1/2 -translate-y-1/2 flex h-control-xs w-control-xs items-center justify-center rounded-md text-muted outline-none transition-opacity',
        'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100 hover:bg-pressed',
        className,
      )}
      {...props}
    />
  );
}
