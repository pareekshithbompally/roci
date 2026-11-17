/** The one model icon: the model's org avatar when known (on this device: its maker), else the provider's icon. */

import React from 'react';
import { ProvidersAvatar } from './ProvidersAvatar';
import { ModelAvatar } from './ModelAvatar';
import { useModelAvatarOrg } from '@shared/hooks/useModelAvatarOrg';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';

interface ModelIconProps {
  provider: string;
  modelId?: string;
  size: number;
  fallback?: 'provider' | 'none';
}

export const ModelIcon: React.FC<ModelIconProps> = ({ provider, modelId, size, fallback = 'provider' }) => {
  const org = useModelAvatarOrg(provider, modelId);
  const providerIcon = fallback === 'provider' ? <ProvidersAvatar provider={provider} size={size} /> : null;
  if (!org) return providerIcon;
  // A maker logo that can't load falls back to this device's glyph, not a monogram.
  const onDevice = provider === LOCAL_MODELS_CONFIG.provider.id;
  return <ModelAvatar org={org} size={size} fallback={onDevice ? providerIcon : undefined} />;
};
