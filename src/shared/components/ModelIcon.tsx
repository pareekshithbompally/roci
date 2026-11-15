/** The one model icon: org avatar for local models with an org, else the provider logo (none if fallback="none"). */

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
