/** This device as a line glyph (laptop on Mac, tablet on iPad, phone on iPhone): what "On this device" looks like. */

import React from 'react';
import { Laptop, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { Icon, ICON_SIZE_PX, type IconSize } from '@shared/ui';
import { useFormFactor, type FormFactor } from '@platform/formFactor';

const GLYPH: Record<FormFactor, LucideIcon> = { desktop: Laptop, tablet: Tablet, phone: Smartphone };

/** The scale step closest to `px`, so the glyph matches the avatar it stands in for. */
function nearestSize(px: number): IconSize {
  const sizes = Object.keys(ICON_SIZE_PX) as IconSize[];
  return sizes.reduce((best, size) => (Math.abs(ICON_SIZE_PX[size] - px) < Math.abs(ICON_SIZE_PX[best] - px) ? size : best));
}

export const DeviceIcon: React.FC<{ size: number }> = ({ size }) => (
  <span aria-hidden className="shrink-0 inline-flex items-center justify-center" style={{ width: size, height: size }}>
    <Icon icon={GLYPH[useFormFactor()]} size={nearestSize(size)} tone="muted" />
  </span>
);
