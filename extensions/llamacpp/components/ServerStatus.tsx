/**
 * ServerStatus Component
 *
 * Displays the current llama-server status with a colored indicator dot.
 */

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import * as server from '../server';
import { TEXT } from '@config/theme.config';
import type { ServerStatus as ServerStatusType } from '../types';

interface ServerStatusProps {
  className?: string;
}

const STATUS_CONFIG: Record<
  ServerStatusType,
  { label: string; colorClass: string; animate?: boolean }
> = {
  idle: { label: 'Stopped', colorClass: 'bg-zinc-400' },
  downloading: { label: 'Downloading...', colorClass: 'bg-blue-400', animate: true },
  starting: { label: 'Starting...', colorClass: 'bg-yellow-400', animate: true },
  running: { label: 'Running', colorClass: 'bg-green-500' },
  stopping: { label: 'Stopping...', colorClass: 'bg-yellow-400', animate: true },
  error: { label: 'Error', colorClass: 'bg-red-500' },
};

export const ServerStatus: React.FC<ServerStatusProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<ServerStatusType>(server.getStatus());

  useEffect(() => {
    return server.onStatusChange(setStatus);
  }, []);

  const config = STATUS_CONFIG[status];
  const port = server.getServerPort();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {config.animate ? (
        <Loader2 className={`w-3 h-3 animate-spin ${TEXT.muted}`} />
      ) : (
        <span
          className={`w-2 h-2 rounded-full ${config.colorClass}`}
        />
      )}
      <span className={`text-xs font-medium ${TEXT.secondary}`}>
        {config.label}
      </span>
      {status === 'running' && port && (
        <span className={`text-xs ${TEXT.faint}`}>
          :{port}
        </span>
      )}
    </div>
  );
};

export default ServerStatus;
