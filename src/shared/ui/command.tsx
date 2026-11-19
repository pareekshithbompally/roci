import { Command as CommandPrimitive } from 'cmdk';
import { LITERAL_TEXT } from './recipes';
import { ChevronRight, Search } from 'lucide-react';
import { PICKER } from '@config/layout.config';
import { Title as DialogPrimitiveTitle } from '@radix-ui/react-dialog';
import type { ComponentProps, ReactNode } from 'react';
import { Dialog, DialogPortal, DialogOverlay, DialogContent } from './dialog';
import { cn } from './utils';
import { MENU_ITEM, MENU_SEPARATOR, SHEET_SURFACE } from './recipes';
import { Icon } from './icon';
import { Text, type TextTone, type TextVariant } from './text';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex flex-col overflow-hidden rounded-lg text-primary', className)} {...props} />;
}

interface CommandInputProps extends ComponentProps<typeof CommandPrimitive.Input> {
  /** `spotlight`: the ⌘K panel's field — a magnifier and large type, as macOS Spotlight's. */
  look?: 'field' | 'spotlight';
}

export function CommandInput({ look = 'field', className, ...props }: CommandInputProps) {
  const input = (
    <CommandPrimitive.Input
      {...LITERAL_TEXT}
      className={cn(
        'flex w-full bg-transparent text-primary placeholder:text-faint outline-none',
        look === 'spotlight' ? 'py-3.5 text-title3' : 'px-3 py-3 border-b border-muted text-body',
        className,
      )}
      {...props}
    />
  );
  if (look === 'field') return input;
  return (
    <div className="flex items-center gap-2.5 px-4 border-b border-muted">
      <Icon icon={Search} size="md" tone="muted" />
      {input}
    </div>
  );
}

/** cmdk wraps List children in a sizer div; `fill` makes it a full-height column so a lone status child can center. */
const LIST_FILL = 'h-72 [&>[cmdk-list-sizer]]:flex [&>[cmdk-list-sizer]]:min-h-full [&>[cmdk-list-sizer]]:flex-col';

/** The ⌘K panel's results: one fixed height in every state (recents, typing, no match), so the panel never resizes. */
const LIST_SPOTLIGHT = 'h-80';

interface CommandListProps extends ComponentProps<typeof CommandPrimitive.List> {
  /** Fixed-height frame whose sizer fills it (palettes that never resize). */
  fill?: boolean;
  /** The ⌘K panel's fixed frame: the same height whatever it lists; its rows scroll inside. */
  spotlight?: boolean;
}

export function CommandList({ fill, spotlight, className, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      className={cn('overflow-y-auto custom-scrollbar p-1', spotlight ? LIST_SPOTLIGHT : 'max-h-72', fill && LIST_FILL, className)}
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
  /** The row's name; it fills the row and truncates, never the columns after it. */
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
}

/** One picker row: icon · name (+ status, description) · meta · check · chevron. The list picks its columns: check and chevron are fixed widths when present, so its rows line up. */
export function CommandRow({
  leading, label, status, labelVariant = 'body', labelTone = 'inherit', description, meta, metaTone = 'faint', check, chevron, ...props
}: CommandRowProps) {
  return (
    <CommandItem {...props}>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <Text variant={labelVariant} tone={labelTone} truncate>{label}</Text>
          {status}
        </span>
        {description && <Text variant="helper" tone="faint" truncate>{description}</Text>}
      </span>
      {meta && (
        <span className={PICKER.metaSlot}>
          {typeof meta === 'string' ? <Text variant="helper" tone={metaTone} className="tabular-nums">{meta}</Text> : meta}
        </span>
      )}
      {check !== undefined && <span className={PICKER.checkSlot}>{check}</span>}
      {chevron !== undefined && <span className={PICKER.chevronSlot}>{chevron && <Icon icon={ChevronRight} size="xs" tone="faint" />}</span>}
    </CommandItem>
  );
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn(MENU_SEPARATOR, className)} {...props} />;
}

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Its name for VoiceOver. */
  label: string;
  children: ReactNode;
}

/** A Spotlight-style palette: a field with results under it, centred near the top of the window over a dimmed view; the
 *  caller filters (cmdk's own filter is off), Escape and a click outside close it. */
export function CommandDialog({ open, onOpenChange, label, children }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent bare aria-describedby={undefined} className={cn(SHEET_SURFACE, 'left-1/2 top-[18vh] w-full max-w-xl -translate-x-1/2 overflow-hidden')}>
          <DialogPrimitiveTitle className="sr-only">{label}</DialogPrimitiveTitle>
          <Command shouldFilter={false}>{children}</Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
