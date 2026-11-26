/** A sheet's quick actions as one row of larger tiles that scrolls sideways (iOS's share-sheet actions): a glyph above a
 *  short label, on the grouped card surface. For the few actions that start something; settings stay as rows below it. */

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
          className={cn(GROUPED_SURFACE, 'flex w-24 shrink-0 flex-col items-center gap-2 px-2 py-3 transition motion-safe:active:scale-95')}
        >
          <Icon icon={icon} size="md" tone="accent" />
          <Text variant="caption" className="w-full text-center" truncate>{name}</Text>
        </button>
      ))}
    </div>
  );
}
