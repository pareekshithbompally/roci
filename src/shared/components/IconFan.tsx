/** Logos fanned like a hand of cards in one icon slot (the AI choices in onboarding): each on a raised tile, turned about one
 *  point below them, the middle on top. */

import React from 'react';
import { Surface, type IconSize } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

const FAN = UI_CONFIG.iconFan;

/** One tile's logo, drawn at the fan's logo size. */
export interface FanTile {
  key: string;
  logo: (size: IconSize) => React.ReactNode;
}

export const IconFan: React.FC<{ tiles: readonly FanTile[] }> = ({ tiles }) => {
  const middle = (tiles.length - 1) / 2;
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: FAN.width, height: FAN.height }}>
      {tiles.map(({ key, logo }, index) => {
        const offset = index - middle;
        return (
          <Surface
            key={key}
            variant="card"
            radius="md"
            edge="all"
            className="absolute flex items-center justify-center overflow-hidden"
            style={{
              width: FAN.tile,
              height: FAN.tile,
              left: (FAN.width - FAN.tile) / 2,
              top: (FAN.height - FAN.tile) / 2,
              transformOrigin: `50% ${FAN.pivotPercent}%`,
              transform: `translateX(${offset * FAN.shiftPx}px) rotate(${offset * FAN.spreadDeg}deg)`,
              // The middle tile sits on top; the outer ones tuck behind it.
              zIndex: tiles.length - Math.abs(offset),
            }}
          >
            {logo(FAN.logo)}
          </Surface>
        );
      })}
    </span>
  );
};
