/** The one model icon: the model's maker when known (its logo or Hugging Face picture), else its provider's logo tile. */

import React from 'react';
import { ProvidersAvatar } from './ProvidersAvatar';
import { ModelAvatar } from './ModelAvatar';
import { useModelAvatarOrg } from '@shared/hooks/useModelAvatarOrg';

interface ModelIconProps {
  provider: string;
  modelId?: string;
  /** Px; a list row's list-art size when left out. */
  size?: number;
  /** The model is loading or replying: a light runs round the tile. */
  working?: boolean;
  fallback?: 'provider' | 'none';
}

export const ModelIcon: React.FC<ModelIconProps> = ({ provider, modelId, size, working, fallback = 'provider' }) => {
  const org = useModelAvatarOrg(provider, modelId);
  const providerIcon = fallback === 'provider' ? <ProvidersAvatar provider={provider} size={size} working={working} /> : null;
  if (!org) return providerIcon;
  return <ModelAvatar org={org} size={size} working={working} fallback={providerIcon ?? undefined} />;
};
