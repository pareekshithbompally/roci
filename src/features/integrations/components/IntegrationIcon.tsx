import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { IconTile } from '@shared/ui';
import { AppIcon } from '@shared/components';

interface IntegrationIconProps {
  /** A Mac app's bundle id: its own icon from macOS. */
  app?: string;
  /** A logo tile, for an integration without an app on this Mac (or as the app's stand-in where macOS can't say). */
  logo?: string;
  /** Line glyph when the app's icon can't be read (iPhone). */
  symbol?: LucideIcon;
}

/** An integration's icon: its Mac app's own icon, else its logo tile, the size of the Settings sidebar's pane icons. */
export const IntegrationIcon: React.FC<IntegrationIconProps> = ({ app, logo, symbol }) => {
  if (app) return <AppIcon app={app} size="tile" fallback={logo} symbol={symbol} />;
  return logo ? <IconTile logo={logo} /> : null;
};
