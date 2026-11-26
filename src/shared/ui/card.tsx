import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './utils';
import { Text } from './text';
import { Icon } from './icon';
import { activateOnKey } from '@shared/utils/activateOnKey';
import { useFormFactor } from '@platform/formFactor';
import { Button } from './button';

/** Grouped settings surface (macOS grouped section): muted label above a filled card; rows 48px (60px with description), inset hairlines. */

const CARD_TONE = {
  default: 'bg-grouped-card',
  /** Copper-washed: a branded box on a neutral panel (onboarding). */
  brand: 'bg-accent-wash',
} as const;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof CARD_TONE;
}

/** A card's rows reach its edges (their pressed tint spans the full width, clipped to the card's corners, as in an iOS
 *  inset grouped list) while their content keeps the card's inset. */
export function Card({ tone = 'default', className, ...props }: CardProps) {
  return (
    <div
      className={cn(CARD_TONE[tone], 'overflow-hidden rounded-card px-4 divide-y divide-muted [&>[data-card-row]]:-mx-4 [&>[data-card-row]]:px-4', className)}
      {...props}
    />
  );
}

export interface CardRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  /** One line about this row's own data (an account, a size, a count), always shown in full; explanations go in the
   *  `Section` footer or the title's ⓘ. */
  description?: React.ReactNode;
  /** Icon or avatar before the copy: centred on the row (iOS / macOS), or on the title line when the content is top-aligned or stacked. */
  leading?: React.ReactNode;
  /** Row state, always right-aligned just before `actions` so states line up down a card. */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** What the row is set to, at its end (iOS): part of the row, so tapping it opens the row; a long one truncates. */
  value?: string;
  /** Its share of a whole under the title (Screen Time's Most Used): a bar in its chart colour, then its figure. */
  meter?: RowMeter;
  /** Stands in, fainter, while there is no `value`. */
  valuePlaceholder?: string;
  /** Control below the copy instead of beside it (wide editors, lists). */
  stacked?: boolean;
  /** `start` pins status + actions to the title line when the description runs long. */
  align?: 'center' | 'start';
  /** Drill-down row (iOS): the whole row is the button and a chevron ends it. */
  onOpen?: () => void;
  /** Action row (iOS): the whole row is the button, no chevron (Choose photo, Import transcript). */
  onPress?: () => void;
  /** An action row's title colour: `accent` for an action (Test Connection, Add Model), `danger` for a destructive one. */
  tone?: 'accent' | 'danger';
  /** The setting this row depends on is off: the row dims, and every control in it is off (one native fieldset), so a
   *  dependent can't be changed while its parent is off. */
  disabled?: boolean;
  /** The row's one command (Clear, Re-index): a push button in the row on a Mac; on a phone its own tinted action row
   *  right below (iOS: a row holds one trailing thing, commands are rows). */
  action?: RowCommand;
}

export interface RowMeter {
  /** 0…1 of the largest row's, which fills the track. */
  share: number;
  /** Its colour token (`--viz-1` …), as the chart draws it. */
  token: string;
  value: string;
}

/** A row's share: a bar across its share of the row's text width, in the row's colour, its figure right after it (a bar
 *  too long for both gives way to the figure). */
const Meter: React.FC<RowMeter> = ({ share, token, value }) => (
  <div className="mt-1 flex items-center gap-2">
    {share > 0 && <div className="h-1.5 min-w-1.5 rounded-full" style={{ flexBasis: `${Math.min(share, 1) * 100}%`, backgroundColor: `var(${token})` }} />}
    <Text variant="figureSmall" tone="muted" className="shrink-0">{value}</Text>
  </div>
);

export interface RowCommand {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'accent' | 'danger';
}

/** A row's command as the Mac's push button. */
const CommandButton: React.FC<{ action: RowCommand }> = ({ action }) => (
  <Button variant="outline" size="sm" onClick={action.onPress} disabled={action.disabled && !action.busy} loading={action.busy}>
    {action.label}
  </Button>
);

export function CardRow({ action, ...props }: CardRowProps) {
  const phone = useFormFactor() === 'phone';
  if (!action) return <RowBody {...props} phone={phone} />;
  if (!phone) return <RowBody {...props} phone={phone} actions={<>{props.actions}<CommandButton action={action} /></>} />;
  return (
    <>
      <RowBody {...props} phone={phone} />
      <RowBody title={action.label} tone={action.tone ?? 'accent'} disabled={action.disabled || action.busy} onPress={action.onPress} phone={phone} />
    </>
  );
}

function RowBody({ title, description, leading, status, actions, value, meter, valuePlaceholder, stacked, align = 'center', onOpen, onPress, tone, disabled, phone, className, children, ...props }: Omit<CardRowProps, 'action'> & { phone: boolean }) {
  const press = disabled ? undefined : onOpen ?? onPress;
  // A phone row holds one trailing thing: with controls at the side, its state reads under the title instead.
  const statusBeside = status && !(phone && actions);
  const chevron = onOpen && <Icon icon={ChevronRight} size="sm" className="shrink-0 text-faint" />;
  const shownValue = value || valuePlaceholder;
  const trailing = statusBeside || actions || shownValue || chevron;
  return (
    <div
      {...(press && { role: 'button', tabIndex: 0, onClick: press, onKeyDown: activateOnKey(press) })}
      className={cn(
        // UIKit cell: icon, then the content view; the separator belongs to the content, so it starts where the text starts.
        'group/row flex gap-row-icon !border-t-0',
        press && 'cursor-pointer active:bg-tint-pressed',
        disabled && 'opacity-50',
        className,
      )}
      aria-disabled={disabled || undefined}
      data-card-row=""
      {...props}
    >
      {/* Pinned rows: a box one title line tall (1lh), so the icon centres on the title line, not on the block. A leading
          icon that draws nothing (a phone's second level) leaves no slot and no gap (empty:hidden), so text lines up. */}
      {leading && (align === 'start' || stacked
        ? <Text as="div" variant="body" className="mt-2 flex h-[1lh] shrink-0 items-center self-start empty:hidden">{leading}</Text>
        : <div className="flex shrink-0 items-center empty:hidden">{leading}</div>)}
      <div
        className={cn(
          // Row height comes from min-h (44 macOS, 52 iOS); 8pt padding lets any control fit inside it, so rows line up.
          'flex min-w-0 flex-1 gap-4 py-2 border-muted group-[:not(:first-child)]/row:border-t',
          stacked ? 'flex-col' : cn('justify-between', align === 'start' ? 'items-start' : 'items-center'),
          description ? 'min-h-15' : 'min-h-row',
        )}
      >
      {/* Title first (iOS / macOS lists): beside controls it keeps its space and the controls truncate; beside a status
          only, the status keeps its one line and the title side truncates instead. */}
      <div className={cn('flex min-w-0', meter || !trailing || stacked ? 'flex-1' : cn('max-w-[70%]', actions || shownValue ? 'shrink-0' : 'shrink'))}>
        <div className={cn('min-w-0', meter && 'flex-1')}>
          <Text as="p" variant="body" tone={tone} truncate>{title}</Text>
          {description && <Text as="p" variant="helper" tone="muted" className="mt-0.5 break-words">{description}</Text>}
          {status && !statusBeside && <div className="mt-1 flex items-center gap-2">{status}</div>}
          {meter && <Meter {...meter} />}
        </div>
      </div>
      {trailing && (
        <div className={cn('flex items-center gap-3', (actions || shownValue) && 'min-w-0', !stacked && !meter && 'flex-1 justify-end')}>
          {statusBeside && <div className="flex shrink-0 items-center gap-2">{status}</div>}
          {shownValue && <Text variant="figure" tone={value ? 'muted' : 'faint'} truncate>{shownValue}</Text>}
          {/* Controls shrink to the row (a long value truncates) instead of spilling past the card; using one never presses
              the row itself. */}
          {actions && (
            <fieldset disabled={disabled} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2 [&>*]:min-w-0">{actions}</fieldset>
          )}
          {chevron}
        </div>
      )}
      {children}
      </div>
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
  /** Title and footer on the column's edge, not inset to the card's rows (a block inside a reply's text). */
  flush?: boolean;
}

/** A card of rows (or a stack of groups): optional label line, the content, optional footer. */
export function Section({ title, accessory, layout = 'card', footer, flush, className, children, ...props }: SectionProps) {
  const inset = flush ? undefined : 'mx-4';
  return (
    <section className={cn('flex flex-col gap-2', className)} {...props}>
      {(title || accessory) && (
        <div className={cn('flex items-center justify-between gap-2 min-h-4', inset)}>
          {title && <Text as="h2" variant="section" tone="muted" className="shrink-0">{title}</Text>}
          {accessory}
        </div>
      )}
      {/* The card fills the section, so sections side by side in a grid row end level. */}
      {layout === 'card' ? <Card className="flex-1">{children}</Card> : <div className="flex flex-col gap-6">{children}</div>}
      {footer && <Text as="p" variant="caption" tone="muted" className={inset}>{footer}</Text>}
    </section>
  );
}
