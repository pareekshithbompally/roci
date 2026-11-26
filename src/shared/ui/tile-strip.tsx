/** A sheet's quick actions as one row that scrolls sideways (iOS's share-sheet row): every tile the same rounded square on
 *  the grouped card surface, its glyph centred in the rows' own ink, its label under it on up to two lines. For the few
 *  actions that start something; settings stay as rows below it. */

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
    <div role="group" aria-label={label} className="-mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1">
      {tiles.map(({ id, label: name, icon, onPress }) => (
        <button key={id} type="button" onClick={onPress} className="group flex w-16 shrink-0 flex-col items-center gap-1.5">
          <span className={cn(GROUPED_SURFACE, 'flex size-15 items-center justify-center transition motion-safe:group-active:scale-95')}>
            <Icon icon={icon} size="md" />
          </span>
          <Text variant="caption" clamp={2} className="w-full text-center">{name}</Text>
        </button>
      ))}
    </div>
  );
}
