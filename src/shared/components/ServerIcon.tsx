/** An MCP server's own icon (cached, so it loads once), or a neutral server glyph when it has none or fails to load. */

import React from 'react';
import { Server } from 'lucide-react';
import { cn } from '@shared/ui';
import { useCachedImage } from '@shared/hooks/useCachedImage';

interface ServerIconProps {
  name: string;
  icon?: string | null;
  /** Matches the kit Icon scale: xs 14 · sm 16 · md 20 */
  size?: 'xs' | 'sm' | 'md';
  /** Layout only */
  className?: string;
}

const SIZE = { xs: 'w-3.5 h-3.5', sm: 'w-4 h-4', md: 'w-5 h-5' } as const;

export const ServerIcon: React.FC<ServerIconProps> = ({ name, icon, size = 'xs', className }) => {
  const { src, failed } = useCachedImage(icon);
  if (!icon || failed) {
    return <Server className={cn('shrink-0 text-muted', SIZE[size], className)} aria-hidden />;
  }
  // Holds the space while the first load runs, so nothing shifts when the icon arrives.
  if (!src) return <span aria-hidden className={cn('shrink-0', SIZE[size], className)} />;
  return (
    <img
      src={src}
      alt=""
      title={name}
      className={cn('shrink-0 rounded-sm object-contain', SIZE[size], className)}
      draggable={false}
    />
  );
};
