import React from 'react';
import { SURFACE } from '@config/theme.config';

interface SidebarShimmerProps {
  count?: number;
}

export const SidebarShimmer: React.FC<SidebarShimmerProps> = ({ count = 5 }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center gap-1.5 px-2 py-1.5">
        <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${SURFACE.skeleton}`} />
        <div className={`flex-1 h-4 rounded ${SURFACE.skeleton}`} />
      </div>
    ))}
  </>
);
