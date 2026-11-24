/**
 * A menu of actions on one trigger: the native menu on a Mac (NSMenu, SF Symbol icons); elsewhere (iPhone, a browser) a drawn
 * menu beside its trigger, as iOS shows a button's menu. Features give entries as data; how they show is decided here once.
 */

import React, { useState } from 'react';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@shared/ui';
import { nativeMenu, type MenuEntry, type NativeMenuEntry } from '@services/tauri';
import { MENU_GAP_PT } from '@config/ui.config';
import { platform } from '@platform/index';

export type { MenuEntry };

type Trigger = React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;

interface MenuProps {
  /** What the menu is for (its name for VoiceOver). */
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

/** The entries as native rows, ids by position; `actions` collects each pickable row's handler. */
function toNative(items: MenuEntry[], actions: Map<string, () => void>, prefix = ''): NativeMenuEntry[] {
  return items.map((entry, i): NativeMenuEntry => {
    const id = `${prefix}${i}`;
    switch (entry.type) {
      case 'separator':
        return { kind: 'separator' };
      case 'label':
        return { kind: 'header', title: entry.label };
      case 'submenu':
        return { kind: 'submenu', title: entry.label, symbol: entry.symbol, items: toNative(entry.items, actions, `${id}.`) };
      case 'check':
        actions.set(id, entry.onSelect);
        return { kind: 'row', id, title: entry.label, checked: entry.checked, enabled: !entry.disabled };
      case 'item':
        actions.set(id, entry.onSelect);
        return { kind: 'row', id, title: entry.label, symbol: entry.symbol, enabled: !entry.disabled };
    }
  });
}

/** Shows the native menu at `x, y` (window points) and runs the row picked, if any. */
async function showNative(items: MenuEntry[], x: number, y: number): Promise<void> {
  const actions = new Map<string, () => void>();
  const { chosen } = await nativeMenu(toNative(items, actions), x, y);
  if (chosen) actions.get(chosen)?.();
}

/** The entries now: as given, or built by the builder. */
const entriesOf = async (items: MenuProps['items']): Promise<MenuEntry[]> => (typeof items === 'function' ? items() : items);

export function Menu({ label, trigger, items: source, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MenuEntry[]>(() => (typeof source === 'function' ? [] : source));
  /** Builds the entries, then shows the drawn menu once they are in. */
  const prepare = (then: () => void) => {
    entriesOf(source)
      .then((built) => { setItems(built); then(); })
      .catch((err: unknown) => console.error('[Menu] building entries failed:', err));
  };

  if (platform.hasMenuBar) {
    return withClick(trigger, (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      entriesOf(source)
        .then((built) => showNative(built, align === 'end' ? r.right : r.left, r.bottom + MENU_GAP_PT))
        .catch((err: unknown) => console.error('[Menu] popup failed:', err));
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => (next ? prepare(() => setOpen(true)) : setOpen(false))}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} aria-label={label}><DrawnEntries items={items} /></DropdownMenuContent>
    </DropdownMenu>
  );
}
