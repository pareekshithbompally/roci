/** What can be done to one item (a document, a meeting, a chat), the same everywhere: ✦ Ask first (tinted, its word beside
 *  it), then the item's own actions as plain glyphs with their names on hover, then ⋯ only for what is rare or destructive
 *  (Delete, Rename, Export). In its header on a Mac, in a toolbar above the home indicator on iPhone (kit `CommandBar`): a
 *  screen places it at both spots and each draws only where it belongs. Ask, To-do and Note are never hidden in a menu. */

import React from 'react';
import { Ellipsis, Sparkles, type LucideIcon } from 'lucide-react';
import { Button, CommandBar, Icon, IconButton, useCommandBarSize } from '@shared/ui';
import { Menu, type MenuEntry } from './Menu';
import { ITEM_ACTIONS_COPY as COPY } from '@config/ui.config';

export interface ItemAction {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export interface ItemActionsProps {
  placement: 'header' | 'bottom';
  /** Ask about this item: a chat about it. */
  onAsk?: () => void;
  /** Its own actions (To-do, Note, Open…), each a glyph. */
  actions?: ItemAction[];
  /** Rare and destructive actions only, behind ⋯. */
  more?: MenuEntry[] | (() => Promise<MenuEntry[]>);
}

/** The actions themselves, for a screen whose own command bar holds them beside other controls (a recording's). */
export function ItemActionRow({ onAsk, actions = [], more }: Omit<ItemActionsProps, 'placement'>) {
  const size = useCommandBarSize();
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onAsk && (
        <Button variant="accentTint" size={size === 'fab' ? 'md' : 'sm'} onClick={onAsk}>
          <Icon icon={Sparkles} size="xs" />
          {COPY.ask}
        </Button>
      )}
      {actions.map((action) => (
        <IconButton key={action.label} icon={action.icon} label={action.label} size={size} onClick={action.onPress} disabled={action.disabled} />
      ))}
      {more && <Menu label={COPY.more} trigger={<IconButton icon={Ellipsis} label={COPY.more} size={size} />} items={more} />}
    </div>
  );
}

export const ItemActions: React.FC<ItemActionsProps> = ({ placement, ...props }) => (
  <CommandBar placement={placement}>
    <ItemActionRow {...props} />
  </CommandBar>
);
