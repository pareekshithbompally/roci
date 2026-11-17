/** An MCP server's own icon (cached, so it loads once), or the MCP mark when it has none or fails to load. */

import React from 'react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { cn, ICON_SIZE_PX, ICON_TILE_PX, IconTile } from '@shared/ui';
import { useCachedImage } from '@shared/hooks/useCachedImage';

interface ServerIconProps {
  name: string;
  icon?: string | null;
  /** `tile`: a Settings row (tile-sized, MCP tile as fallback). Inline sizes match the kit Icon scale: xs 14 · sm 16 · md 20. */
  size?: 'xs' | 'sm' | 'md' | 'tile';
  /** Layout only */
  className?: string;
}

const PX = { xs: ICON_SIZE_PX.xs, sm: ICON_SIZE_PX.sm, md: ICON_SIZE_PX.md, tile: ICON_TILE_PX } as const;

/** No icon of its own: the MCP mark, on a connections tile in Settings, muted inline elsewhere. */
const Fallback: React.FC<{ size: keyof typeof PX; className?: string }> = ({ size, className }) =>
  size === 'tile' ? (
    <IconTile icon={SiModelcontextprotocol} />
  ) : (
    <SiModelcontextprotocol size={PX[size]} title="" aria-hidden className={cn('shrink-0 text-muted', className)} />
  );

export const ServerIcon: React.FC<ServerIconProps> = ({ name, icon, size = 'xs', className }) => {
  const { src, failed } = useCachedImage(icon);
  const box = { width: PX[size], height: PX[size] };
  if (!icon || failed) return <Fallback size={size} className={className} />;
  // Holds the space while the first load runs, so nothing shifts when the icon arrives.
  if (!src) return <span aria-hidden className={cn('shrink-0', className)} style={box} />;
  return (
    <img
      src={src}
      alt=""
      title={name}
      className={cn('shrink-0 rounded-sm object-contain', className)}
      style={box}
      draggable={false}
    />
  );
};
