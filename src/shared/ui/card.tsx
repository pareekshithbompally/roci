import React from 'react';
import { cn } from './utils';
import { Text } from './text';

/**
 * Grouped settings surface (macOS System Settings / HEX `controls.rs`):
 * a muted label above a raised card whose rows are split by hairlines inset
 * 16px on both sides. Rows are 48px, or 60px with a description.
 */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-base shadow-raised rounded-lg px-4 divide-y divide-muted', className)} {...props} />;
}

export interface CardRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Control below the copy instead of beside it (wide editors, lists). */
  stacked?: boolean;
  /** `start` pins actions to the title line when the description runs long. */
  align?: 'center' | 'start';
}

export function CardRow({ title, description, actions, stacked, align = 'center', className, children, ...props }: CardRowProps) {
  return (
    <div
      className={cn(
        'flex gap-4 py-3',
        stacked ? 'flex-col' : cn('justify-between', align === 'start' ? 'items-start' : 'items-center'),
        description ? 'min-h-15' : 'min-h-12',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <Text as="p" variant="bodyStrong">{title}</Text>
        {description && <Text as="p" variant="helper" tone="muted" className="mt-0.5">{description}</Text>}
      </div>
      {actions && <div className={cn('flex items-center gap-2', !stacked && 'shrink-0')}>{actions}</div>}
      {children}
    </div>
  );
}

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  /** Control on the label line (Add, Advanced…); ends where row controls do. */
  accessory?: React.ReactNode;
  /** `card` (default): children are rows of one card. `stack`: children are their own cards, spaced apart. */
  layout?: 'card' | 'stack';
}

/** A titled card of rows (or a stack of cards): label line, then the content. */
export function Section({ title, accessory, layout = 'card', className, children, ...props }: SectionProps) {
  return (
    <section className={cn('flex flex-col gap-2', className)} {...props}>
      <div className="flex items-center justify-between gap-2 h-4 mx-4">
        <Text as="h2" variant="label" tone="muted">{title}</Text>
        {accessory}
      </div>
      {layout === 'card' ? <Card>{children}</Card> : <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}
