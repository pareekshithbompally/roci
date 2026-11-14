import React from 'react';
import { Surface } from '@shared/ui';

/** An integration's app icon at row size. */
export const IntegrationIcon: React.FC<{ src: string; alt: string }> = ({ src, alt }) => (
  <Surface radius="md" className="w-5 h-5 shrink-0 overflow-hidden">
    <img src={src} alt={alt} className="w-full h-full" />
  </Surface>
);
