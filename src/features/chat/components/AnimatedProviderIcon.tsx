/** Model icon with an animated ring while loading or streaming; fixed outer size so it never shifts. */

import React from 'react';
import { ModelIcon } from '@shared/components';
import { STREAMING_CONFIG } from '@config/streaming.config';
import { Surface } from '@shared/ui';

interface AnimatedProviderIconProps {
  provider: string;
  /** Model id, so local models show their org avatar. */
  modelId?: string;
  size?: number;
  isAnimating?: boolean;
}

export const AnimatedProviderIcon: React.FC<AnimatedProviderIconProps> = ({
  provider,
  modelId,
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
        <Surface
          radius="full"
          className="absolute inset-0 animate-spin"
          style={{
            background: 'conic-gradient(from 0deg, transparent, var(--info-fg), var(--ai-accent), transparent)',
            padding: '2px',
            animationDuration: `${STREAMING_CONFIG.LOADING_RING_DURATION_MS}ms`,
            willChange: 'transform',
          }}
        >
          <Surface variant="card" radius="full" className="w-full h-full" />
        </Surface>
      )}

      {/* Provider icon — always centered, always same size */}
      <div className="relative z-10">
        <ModelIcon provider={provider} modelId={modelId} size={size} />
      </div>
    </div>
  );
};
