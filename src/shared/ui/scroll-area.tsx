import type { HTMLAttributes } from 'react';
import { cn } from './utils';

/**
 * Vertical scroll region. Overflow clips at the padding edge, and kit fields
 * draw their hairline (`shadow-input`) and focus ring outside their box — so
 * the region pads itself by that much, cancelled by an equal negative margin.
 * Children sit exactly where they would without it, edges intact.
 *
 * Callers add layout (width, flex, gap) but never padding.
 */
export function ScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 overflow-y-auto custom-scrollbar -m-1 p-1', className)} {...props} />;
}
