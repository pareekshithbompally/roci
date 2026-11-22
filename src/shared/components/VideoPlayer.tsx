/** Video inline, with the system's own controls: WebKit plays it natively on the Mac, iPad and iPhone. */

import React from 'react';
import { Surface } from '@shared/ui';

export const VideoPlayer: React.FC<{ src: string; label: string }> = ({ src, label }) => (
  <Surface radius="lg" className="w-full overflow-hidden">
    <video src={src} controls playsInline preload="metadata" className="block h-auto w-full">
      {label}
    </video>
  </Surface>
);
