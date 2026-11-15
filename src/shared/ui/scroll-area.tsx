import type { HTMLAttributes } from 'react';
import { cn } from './utils';

/** Scroll region padded (and negatively margined) so field hairlines and focus rings are not clipped; never pad it. */
export function ScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 overflow-y-auto custom-scrollbar -m-1 p-1', className)} {...props} />;
}
