import React from 'react';
import { cn } from './utils';
import { SURFACE, TEXT } from '@config/theme.config';

/**
 * Canonical list/sidebar row. Fixed Jan-style recipe — tight, borderless,
 * truncated — so every list in the app shares one shape.
 *
 * - `Row` — button row for clickable items (suggestions, citations, nav).
 * - `rowClasses` — same recipe for non-button shells (rows that contain
 *   nested buttons, e.g. the sidebar item with its row menu).
 */
export function rowClasses(selected?: boolean): string {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-[1.5] transition-colors cursor-pointer min-w-0',
    selected ? `${SURFACE.selected} ${TEXT.primary}` : `${TEXT.secondary} ${SURFACE.hoverSubtle}`
  );
}

export interface RowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Row({ selected, className, type = 'button', ...props }: RowProps) {
  return <button type={type} className={cn(rowClasses(selected), className)} {...props} />;
}
