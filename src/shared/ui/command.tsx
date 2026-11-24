import { Command as CommandPrimitive } from 'cmdk';
import { ChevronRight, Search } from 'lucide-react';
import { COMMAND_PALETTE, PICKER } from '@config/layout.config';
import type { ComponentProps, KeyboardEventHandler, ReactNode } from 'react';
import { Dialog, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from './dialog';
import { cn } from './utils';
import { LITERAL_TEXT, MENU_ITEM, MENU_SEPARATOR, SHEET_SURFACE } from './recipes';
import { Icon } from './icon';
import { Text, type TextTone, type TextVariant } from './text';
import { Keycaps } from './kbd';
import { platform } from '@platform/index';

/** A finger's list (iOS) shows a long name whole, on a second line; a Mac's dense list cuts it short. */
const wholeNames = platform.hasTouchScreen;

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex flex-col overflow-hidden rounded-lg text-primary', className)} {...props} />;
}

interface CommandInputProps extends ComponentProps<typeof CommandPrimitive.Input> {
  /** `palette`: the ⌘K field — a magnifier, then (inside a drill-down) where you are, then the text. */
  look?: 'field' | 'palette';
  /** Palette only: the level you drilled into, shown before the text (Settings ›). */
  breadcrumb?: string;
}

export function CommandInput({ look = 'field', breadcrumb, className, ...props }: CommandInputProps) {
  const input = (
    <CommandPrimitive.Input
      {...LITERAL_TEXT}
      className={cn(
        'flex w-full bg-transparent text-body text-primary placeholder:text-faint outline-none',
        look === 'palette' ? 'py-3.5' : 'px-3 py-3 border-b border-muted',
        className,
      )}
      {...props}
    />
  );
  if (look === 'field') return input;
  return (
    <div className="flex items-center gap-2.5 px-4 border-b border-muted">
      <Icon icon={Search} size="sm" tone="faint" />
      {breadcrumb && (
        <span data-palette-breadcrumb className="flex shrink-0 items-center gap-1">
          <Text variant="label">{breadcrumb}</Text>
          <Icon icon={ChevronRight} size="xs" tone="faint" />
        </span>
      )}
      {input}
    </div>
  );
}

interface CommandListProps extends ComponentProps<typeof CommandPrimitive.List> {
  /** The ⌘K palette's fixed frame: the same height whatever it lists; its rows scroll inside. */
  palette?: boolean;
}

export function CommandList({ palette, className, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      className={cn('overflow-y-auto custom-scrollbar p-1', palette ? COMMAND_PALETTE.listHeight : 'max-h-72', className)}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className={cn('py-6 text-center text-body text-muted', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-callout [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn(MENU_ITEM, 'gap-1.5 data-[selected=true]:bg-hover', className)} {...props} />;
}

export interface CommandRowProps extends Omit<ComponentProps<typeof CommandPrimitive.Item>, 'children'> {
  /** Leading glyph: a kit Icon, a model or server icon. */
  leading?: ReactNode;
  /** The row's name; it fills the row and truncates (wraps on a touch screen), never the columns after it. */
  label: ReactNode;
  /** A small mark right after the name that never truncates (e.g. a loaded dot). */
  status?: ReactNode;
  labelVariant?: TextVariant;
  labelTone?: TextTone;
  /** A second line under the name: why it's unavailable, where it comes from, a next step. */
  description?: ReactNode;
  /** A short fact (a count, a status word, small marks) in a fixed-width column; text reads as helper type. */
  meta?: ReactNode;
  metaTone?: TextTone;
  /** A check mark or checkbox in a fixed column; `null` keeps the column empty, omit it when the list has none. */
  check?: ReactNode;
  /** It opens more beside the row (a flyout); `false` keeps the column empty, omit it when the list has none. */
  chevron?: boolean;
  /** The shortcut that does the same outside the list, one keycap per key (⌘ ,). */
  keys?: readonly string[];
}

/** One picker row: icon · name (+ status, description) · meta · keys · check · chevron. The list picks its columns: check and chevron are fixed widths when present, so its rows line up. */
export function CommandRow({
  leading, label, status, labelVariant = 'body', labelTone = 'inherit', description, meta, metaTone = 'faint', check, chevron, keys, ...props
}: CommandRowProps) {
  return (
    <CommandItem {...props}>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <Text variant={labelVariant} tone={labelTone} truncate={!wholeNames} className={cn('min-w-0', wholeNames && 'break-words')}>{label}</Text>
          {status}
        </span>
        {description && <Text variant="helper" tone="faint" truncate>{description}</Text>}
      </span>
      {meta && (
        <span className={PICKER.metaSlot}>
          {typeof meta === 'string' ? <Text variant="helper" tone={metaTone} className="tabular-nums">{meta}</Text> : meta}
        </span>
      )}
      {keys && keys.length > 0 && <span className={PICKER.metaSlot}><Keycaps keys={keys} /></span>}
      {check !== undefined && <span className={PICKER.checkSlot}>{check}</span>}
      {chevron !== undefined && <span className={PICKER.chevronSlot}>{chevron && <Icon icon={ChevronRight} size="xs" tone="faint" />}</span>}
    </CommandItem>
  );
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn(MENU_SEPARATOR, className)} {...props} />;
}



/** The palette's footer: the key hints, and on the right whatever the caller adds (a count, what Escape does). */
export function CommandFooter({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-muted px-4 py-2.5">
      {children}
      <span className="ml-auto flex items-center gap-4">{trailing}</span>
    </div>
  );
}

/** A footer hint: the keys, then what they do (↑ ↓ Navigate). */
export function KeyHint({ keys, label }: { keys: readonly string[]; label: string }) {
  return (
    <Text variant="helper" tone="faint" className="flex items-center gap-1.5">
      <Keycaps keys={keys} />
      {label}
    </Text>
  );
}

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Escape: the caller peels one layer (clear, back) and calls `event.preventDefault()` to keep the dialog open. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Keys inside the dialog (Backspace to go back, → to drill in). */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /** Its name for VoiceOver. */
  label: string;
  children: ReactNode;
}

/** A command palette: a field with its list under it, near the top of the window over a dimmed view; the caller filters
 *  and ranks (cmdk's own filter is off). A click outside closes it; Escape closes it unless the caller keeps it open. */
export function CommandDialog({ open, onOpenChange, onEscapeKeyDown, onKeyDown, label, children }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          bare
          aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown}
          // A command moves focus where it goes (the composer, a view): closing must not pull it back.
          onCloseAutoFocus={(event) => event.preventDefault()}
          className={cn(SHEET_SURFACE, COMMAND_PALETTE.frame, 'overflow-hidden')}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <Command shouldFilter={false} onKeyDown={onKeyDown}>{children}</Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
