import React from 'react';
import { Surface } from '@shared/ui';
import { AppIcon } from '@shared/components';

interface IntegrationIconProps {
  /** A Mac app's bundle id: its own icon from macOS. */
  app?: string;
  /** An image for integrations without an app on this Mac (or before it's installed). */
  src?: string;
}

/** An integration's icon at row size: the app's own icon when it has one, else its image. */
export const IntegrationIcon: React.FC<IntegrationIconProps> = ({ app, src }) => {
  if (app) return <AppIcon app={app} size="md" fallback={src} />;
  return (
    <Surface radius="md" className="w-5 h-5 shrink-0 overflow-hidden">
      <img src={src} alt="" className="w-full h-full" />
    </Surface>
  );
};
