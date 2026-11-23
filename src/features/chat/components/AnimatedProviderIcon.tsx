/** Model icon with an animated ring while loading or streaming; the ring is drawn outside the icon's box, so the icon takes
 *  the same room as any row glyph and never shifts. */

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
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {/* Animated gradient ring */}
      {isAnimating && (
        <Surface
          radius="full"
          className="absolute -inset-1 animate-spin"
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
