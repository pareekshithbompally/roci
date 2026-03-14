/**
 * AnimatedProviderIcon Component
 *
 * Provider icon with animated gradient ring for loading/streaming state.
 * Uses a fixed outer size so the icon never shifts or resizes between states.
 */

import React from 'react';
import ProvidersAvatar from '@/components/ProvidersAvatar';
import { STREAMING_CONFIG } from '@config/streaming.config';
import { SURFACE } from '@config/theme.config';

interface AnimatedProviderIconProps {
  provider: string;
  size?: number;
  isAnimating?: boolean;
}

export const AnimatedProviderIcon: React.FC<AnimatedProviderIconProps> = ({
  provider,
  size = 20,
  isAnimating = false,
}) => {
  // Fixed outer dimension: icon size + ring padding
  const ringPad = 4;
  const outerSize = size + ringPad * 2;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: outerSize, height: outerSize }}
    >
      {/* Animated gradient ring */}
      {isAnimating && (
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            background: 'conic-gradient(from 0deg, transparent, #3b82f6, #8b5cf6, transparent)',
            padding: '2px',
            animationDuration: `${STREAMING_CONFIG.LOADING_RING_DURATION_MS}ms`,
            willChange: 'transform',
          }}
        >
          <div className={`w-full h-full rounded-full ${SURFACE.card}`} />
        </div>
      )}

      {/* Provider icon — always centered, always same size */}
      <div className="relative z-10">
        <ProvidersAvatar provider={provider} size={size} />
      </div>
    </div>
  );
};
