/**
 * ServerIcon — an MCP server's own icon (from its `serverInfo.icons`), or a
 * neutral server glyph when it offers none or the image fails to load.
 * Presentational: callers look the icon up (useMcpServerInfo).
 */

import React, { useState } from 'react';
import { Server } from 'lucide-react';
import { COMPONENT, TEXT } from '@config/theme.config';
import { cn } from '@shared/ui';

interface ServerIconProps {
  name: string;
  icon?: string | null;
  /** Tailwind size classes, e.g. `w-3.5 h-3.5` (matches neighbouring lucide icons). */
  className?: string;
}

export const ServerIcon: React.FC<ServerIconProps> = ({ name, icon, className = 'w-3.5 h-3.5' }) => {
  const [failed, setFailed] = useState(false);
  if (!icon || failed) {
    return <Server className={cn('shrink-0', TEXT.muted, className)} aria-hidden />;
  }
  return (
    <img
      src={icon}
      alt=""
      title={name}
      className={cn(COMPONENT.serverIcon, className)}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
};
