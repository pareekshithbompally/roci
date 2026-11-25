/** Logo tiles fanned like a hand of cards in one icon slot (the AI choices in onboarding): turned about one point below
 *  them, the middle on top. */

import React from 'react';
import { IconTile } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

const FAN = UI_CONFIG.iconFan;

export const IconFan: React.FC<{ logos: readonly string[] }> = ({ logos }) => {
  const middle = (logos.length - 1) / 2;
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: FAN.width, height: FAN.height }}>
      {logos.map((logo, index) => {
        const offset = index - middle;
        return (
          <span
            key={logo}
            className="absolute flex"
            style={{
              left: (FAN.width - FAN.tile) / 2,
              top: (FAN.height - FAN.tile) / 2,
              transformOrigin: `50% ${FAN.pivotPercent}%`,
              transform: `translateX(${offset * FAN.shiftPx}px) rotate(${offset * FAN.spreadDeg}deg)`,
              // The middle tile sits on top; the outer ones tuck behind it.
              zIndex: logos.length - Math.abs(offset),
            }}
          >
            <IconTile logo={logo} size={FAN.tile} />
          </span>
        );
      })}
    </span>
  );
};
