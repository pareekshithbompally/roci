/**
 * ModelIcon — the one icon for a model anywhere in the app.
 *
 * Local models with an org (and Model Icons enabled) show the org avatar;
 * everything else shows the provider logo, or nothing when `fallback="none"`
 * (list rows that already sit under their provider's heading).
 */

import React from 'react';
import { ProvidersAvatar } from './ProvidersAvatar';
import { ModelAvatar } from './ModelAvatar';
import { useModelAvatarOrg } from '@shared/hooks/useModelAvatarOrg';

interface ModelIconProps {
  provider: string;
  modelId?: string;
  size: number;
  fallback?: 'provider' | 'none';
}

export const ModelIcon: React.FC<ModelIconProps> = ({ provider, modelId, size, fallback = 'provider' }) => {
  const org = useModelAvatarOrg(provider, modelId);
  if (org) return <ModelAvatar org={org} size={size} />;
  return fallback === 'provider' ? <ProvidersAvatar provider={provider} size={size} /> : null;
};
