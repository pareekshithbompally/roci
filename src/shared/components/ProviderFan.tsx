/** Provider logos fanned like cards in one icon slot: each on a raised tile, sliding out and tilting from the middle, which sits on top. */

import React from 'react';
import { Surface } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';
import { ProvidersAvatar } from './ProvidersAvatar';

const FAN = UI_CONFIG.providerFan;

export const ProviderFan: React.FC<{ providers: readonly string[] }> = ({ providers }) => {
  const middle = (providers.length - 1) / 2;
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: FAN.width, height: FAN.height }}>
      {providers.map((provider, index) => {
        const offset = index - middle;
        return (
          <Surface
            key={provider}
            variant="card"
            radius="md"
            edge="all"
            className="absolute flex items-center justify-center"
            style={{
              width: FAN.tile,
              height: FAN.tile,
              left: (FAN.width - FAN.tile) / 2,
              top: (FAN.height - FAN.tile) / 2,
              transformOrigin: '50% 100%',
              transform: `translateX(${offset * FAN.shiftPx}px) rotate(${offset * FAN.spreadDeg}deg)`,
              // The middle tile sits on top; the outer ones tuck behind it.
              zIndex: providers.length - Math.abs(offset),
            }}
          >
            <ProvidersAvatar provider={provider} size={FAN.logo} />
          </Surface>
        );
      })}
    </span>
  );
};
