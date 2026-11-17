import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './utils';
import { Text } from './text';
import { Icon } from './icon';
import { activateOnKey } from '@shared/utils/activateOnKey';
import { useFormFactor } from '@platform/formFactor';

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
  /** One line about this row's own data (an account, a size, a count), cut short; explanations go in the `Section` footer. */
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
  // Phone: the copy keeps the width — state reads under the description, the side holds only the control.
  const phone = useFormFactor() === 'phone';
  const statusBeside = status && !phone;
  const chevron = onOpen && <Icon icon={ChevronRight} size="sm" className="text-faint" />;
  const trailing = statusBeside || actions || chevron;
  return (
    <div
      {...(press && { role: 'button', tabIndex: 0, onClick: press, onKeyDown: activateOnKey(press) })}
      className={cn(
        press && 'cursor-pointer active:bg-tint-pressed',
        'flex gap-4 py-3',
        stacked ? 'flex-col' : cn('justify-between', align === 'start' ? 'items-start' : 'items-center'),
        description ? 'min-h-15' : 'min-h-12',
        className,
      )}
      {...props}
    >
      <div className={cn('flex min-w-0 flex-1 gap-2.5', leadingAlign === 'row' ? 'items-center' : 'items-start')}>
        {/* `title`: one title line tall (1lh of the title style), so the icon centres on the title, not the block. */}
        {leading && (leadingAlign === 'row'
          ? <div className="flex shrink-0 items-center">{leading}</div>
          : <Text as="div" variant="bodyStrong" className="flex h-[1lh] shrink-0 items-center">{leading}</Text>)}
        <div className="min-w-0">
          <Text as="p" variant="bodyStrong" className="break-words">{title}</Text>
          {description && <Text as="p" variant="helper" tone="muted" truncate className="mt-0.5">{description}</Text>}
          {status && phone && <div className="mt-1 flex items-center gap-2">{status}</div>}
        </div>
      </div>
      {trailing && (
        <div className={cn('flex min-w-0 items-center gap-3', !stacked && 'max-w-[50%] shrink-0')}>
          {statusBeside && <div className="flex min-w-0 items-center gap-2">{status}</div>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
          {chevron}
        </div>
      )}
      {children}
    </div>
  );
}

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Omitted for a group that needs no label (a lone group, an app's own card). */
  title?: React.ReactNode;
  /** Control on the label line (Add, Advanced…); ends where row controls do. */
  accessory?: React.ReactNode;
  /** `card` (default): children are rows of one card. `stack`: children are their own cards, spaced apart. */
  layout?: 'card' | 'stack';
  /** What the group's rows do, in a sentence or two under the card (System Settings footer); rows stay one line. */
  footer?: React.ReactNode;
}

/** A card of rows (or a stack of groups): optional label line, the content, optional footer. */
export function Section({ title, accessory, layout = 'card', footer, className, children, ...props }: SectionProps) {
  return (
    <section className={cn('flex flex-col gap-2', className)} {...props}>
      {(title || accessory) && (
        <div className="flex items-center justify-between gap-2 min-h-4 mx-4">
          {title && <Text as="h2" variant="label" tone="muted">{title}</Text>}
          {accessory}
        </div>
      )}
      {layout === 'card' ? <Card>{children}</Card> : <div className="flex flex-col gap-6">{children}</div>}
      {footer && <Text as="p" variant="helper" tone="muted" className="mx-4">{footer}</Text>}
    </section>
  );
}
