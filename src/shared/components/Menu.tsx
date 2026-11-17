/**
 * A menu of actions on one trigger: the system menu on a Mac (NSMenu), an action sheet on a phone (iOS), a drawn
 * dropdown only in a browser. Features give entries as data; how they show is decided here once.
 */

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import {
  BottomSheet, CardRow, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Icon, Section,
} from '@shared/ui';
import { popupMenu, type MenuEntry } from '@services/tauri';
import { useFormFactor } from '@platform/formFactor';
import { platform } from '@platform/index';

export type { MenuEntry };

type Trigger = React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;

interface MenuProps {
  /** What the menu is for (the sheet's name for VoiceOver). */
  label: string;
  trigger: Trigger;
  /** The entries, or a builder run as the menu opens (a native menu can't change once shown: windows to capture). */
  items: MenuEntry[] | (() => Promise<MenuEntry[]>);
  /** Drawn dropdown only: which edge of the trigger it lines up with. */
  align?: 'start' | 'end';
}

/** The trigger with `open` run on click, after its own handler (which may stop the row behind it). */
function withClick(trigger: Trigger, open: (e: React.MouseEvent<HTMLElement>) => void): Trigger {
  return React.cloneElement(trigger, {
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(e);
      open(e);
    },
  });
}

/** Action-sheet groups: separators split them, a label or a submenu titles one. */
function sheetGroups(items: MenuEntry[]): Array<{ title?: string; rows: MenuEntry[] }> {
  const groups: Array<{ title?: string; rows: MenuEntry[] }> = [{ rows: [] }];
  for (const entry of items) {
    if (entry.type === 'separator') groups.push({ rows: [] });
    else if (entry.type === 'label') groups.push({ title: entry.label, rows: [] });
    else if (entry.type === 'submenu') groups.push({ title: entry.label, rows: entry.items.filter((e) => e.type === 'item' || e.type === 'check') }, { rows: [] });
    else groups[groups.length - 1].rows.push(entry);
  }
  return groups.filter((g) => g.rows.length > 0);
}

const SheetRow: React.FC<{ entry: MenuEntry; done: () => void }> = ({ entry, done }) => {
  if (entry.type !== 'item' && entry.type !== 'check') return null;
  const run = () => {
    done();
    entry.onSelect();
  };
  return (
    <CardRow
      title={entry.label}
      // iOS: actions are tinted (red when destructive); a checkable option is plain text with its checkmark.
      tone={entry.type === 'check' ? undefined : entry.destructive ? 'danger' : 'accent'}
      onPress={entry.disabled ? undefined : run}
      actions={entry.type === 'check' && entry.checked ? <Icon icon={Check} size="sm" tone="accent" /> : undefined}
    />
  );
};

const DrawnEntries: React.FC<{ items: MenuEntry[] }> = ({ items }) => (
  <>
    {items.map((entry, i) => {
      switch (entry.type) {
        case 'item':
          return <DropdownMenuItem key={i} disabled={entry.disabled} variant={entry.destructive ? 'danger' : 'default'} onSelect={entry.onSelect}>{entry.label}</DropdownMenuItem>;
        case 'check':
          return <DropdownMenuCheckboxItem key={i} checked={entry.checked} disabled={entry.disabled} onSelect={entry.onSelect}>{entry.label}</DropdownMenuCheckboxItem>;
        case 'label':
          return <DropdownMenuLabel key={i}>{entry.label}</DropdownMenuLabel>;
        case 'separator':
          return <DropdownMenuSeparator key={i} />;
        case 'submenu':
          return (
            <DropdownMenuSub key={i}>
              <DropdownMenuSubTrigger>{entry.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent><DrawnEntries items={entry.items} /></DropdownMenuSubContent>
            </DropdownMenuSub>
          );
      }
    })}
  </>
);

/** The entries now: as given, or built by the builder. */
const entriesOf = async (items: MenuProps['items']): Promise<MenuEntry[]> => (typeof items === 'function' ? items() : items);

export function Menu({ label, trigger, items: source, align = 'end' }: MenuProps) {
  const phone = useFormFactor() === 'phone';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MenuEntry[]>(() => (typeof source === 'function' ? [] : source));
  /** Builds the entries, then shows them (sheet / drawn) once they are in. */
  const prepare = (then: () => void) => {
    entriesOf(source)
      .then((built) => { setItems(built); then(); })
      .catch((err: unknown) => console.error('[Menu] building entries failed:', err));
  };

  if (platform.hasMenuBar) {
    return withClick(trigger, (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      entriesOf(source)
        .then((built) => popupMenu(built, align === 'end' ? r.right : r.left, r.bottom + 4))
        .catch((err: unknown) => console.error('[Menu] popup failed:', err));
    });
  }

  if (phone) {
    return (
      <>
        {withClick(trigger, () => prepare(() => setOpen(true)))}
        <BottomSheet open={open} onOpenChange={setOpen} title={label}>
          <div className="flex flex-col gap-section overflow-y-auto p-4">
            {sheetGroups(items).map((group, i) => (
              <Section key={i} title={group.title}>
                {group.rows.map((entry, j) => <SheetRow key={j} entry={entry} done={() => setOpen(false)} />)}
              </Section>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => (next ? prepare(() => setOpen(true)) : setOpen(false))}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}><DrawnEntries items={items} /></DropdownMenuContent>
    </DropdownMenu>
  );
}
