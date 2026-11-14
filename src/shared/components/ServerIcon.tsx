/**
 * ServerIcon — an MCP server's own icon (from its `serverInfo.icons`), or a
 * neutral server glyph when it offers none or the image fails to load.
 * Presentational: callers look the icon up (useMcpServerInfo).
 */

import React, { useState } from 'react';
import { Server } from 'lucide-react';
import { cn } from '@shared/ui';

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
  const [failed, setFailed] = useState(false);
  if (!icon || failed) {
    return <Server className={cn('shrink-0 text-muted', SIZE[size], className)} aria-hidden />;
  }
  return (
    <img
      src={icon}
      alt=""
      title={name}
      className={cn('shrink-0 rounded-sm object-contain', SIZE[size], className)}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
};
