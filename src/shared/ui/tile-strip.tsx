/** A sheet's quick actions as one row of tiles that scrolls sideways (iOS's share-sheet actions): a glyph above its label, in
 *  the same ink and text as the rows below, each tile as wide as its label. For the few actions that start something;
 *  settings stay as rows below it. */

import type { LucideIcon } from 'lucide-react';
import { Icon } from './icon';
import { Text } from './text';
import { cn } from './utils';
import { GROUPED_SURFACE } from './recipes';

export interface StripTile {
  id: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}

export function TileStrip({ label, tiles }: { label: string; tiles: readonly StripTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {tiles.map(({ id, label: name, icon, onPress }) => (
        <button
          key={id}
          type="button"
          onClick={onPress}
          className={cn(GROUPED_SURFACE, 'flex shrink-0 flex-col items-center gap-2 px-4 py-3 transition motion-safe:active:scale-95')}
        >
          <Icon icon={icon} size="md" />
          <Text variant="body" className="whitespace-nowrap">{name}</Text>
        </button>
      ))}
    </div>
  );
}
