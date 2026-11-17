import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './utils';
import { Text } from './text';
import { Icon } from './icon';

/** Grouped settings surface (macOS grouped section): muted label above a filled card; rows 48px (60px with description), inset hairlines. */

const CARD_TONE = {
  default: 'bg-layer-2',
  /** Copper-washed: a branded box on a neutral panel (onboarding). */
  brand: 'bg-accent-wash',
} as const;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof CARD_TONE;
}

export function Card({ tone = 'default', className, ...props }: CardProps) {
  return <div className={cn(CARD_TONE[tone], 'rounded-xl px-4 divide-y divide-muted', className)} {...props} />;
}

export interface CardRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Icon or avatar before the copy, centred on the title line; the description indents under the title. */
  leading?: React.ReactNode;
  /** `row` centres a large leading image (an app icon) on title and description together, as System Settings does. */
  leadingAlign?: 'title' | 'row';
  /** Row state, always right-aligned just before `actions` so states line up down a card. */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** Control below the copy instead of beside it (wide editors, lists). */
  stacked?: boolean;
  /** `start` pins status + actions to the title line when the description runs long. */
  align?: 'center' | 'start';
  /** Drill-down row (iOS): the whole row is the button and a chevron ends it. */
  onOpen?: () => void;
  /** Action row (iOS): the whole row is the button, no chevron (Choose photo, Import transcript). */
  onPress?: () => void;
}

export function CardRow({ title, description, leading, leadingAlign = 'title', status, actions, stacked, align = 'center', onOpen, onPress, className, children, ...props }: CardRowProps) {
  const press = onOpen ?? onPress;
  const chevron = onOpen && <Icon icon={ChevronRight} size="sm" className="text-faint" />;
  const trailing = status || actions || chevron;
  const pressOnKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') press?.();
  };
  return (
    <div
      {...(press && { role: 'button', tabIndex: 0, onClick: press, onKeyDown: pressOnKey })}
      className={cn(
        press && 'cursor-pointer active:bg-tint-pressed',
        'flex gap-4 py-3',
        stacked ? 'flex-col' : cn('justify-between', align === 'start' ? 'items-start' : 'items-center'),
        description ? 'min-h-15' : 'min-h-12',
        className,
      )}
      {...props}
    >
      <div className={cn('flex min-w-0 gap-2.5', leadingAlign === 'row' ? 'items-center' : 'items-start')}>
        {/* `title`: one title line tall (1lh of the title style), so the icon centres on the title, not the block. */}
        {leading && (leadingAlign === 'row'
          ? <div className="flex shrink-0 items-center">{leading}</div>
          : <Text as="div" variant="bodyStrong" className="flex h-[1lh] shrink-0 items-center">{leading}</Text>)}
        <div className="min-w-0">
          <Text as="p" variant="bodyStrong">{title}</Text>
          {description && <Text as="p" variant="helper" tone="muted" className="mt-0.5">{description}</Text>}
        </div>
      </div>
      {trailing && (
        <div className={cn('flex items-center gap-3', !stacked && 'shrink-0')}>
          {status && <div className="flex items-center gap-2">{status}</div>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
          {chevron}
        </div>
      )}
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
