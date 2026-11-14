import React from 'react';
import { Surface } from '@shared/ui';

interface SidebarShimmerProps {
  count?: number;
}

export const SidebarShimmer: React.FC<SidebarShimmerProps> = ({ count = 5 }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center h-8 px-2">
        <Surface variant="inset" radius="md" className="flex-1 h-3.5 animate-pulse" />
      </div>
    ))}
  </>
);
