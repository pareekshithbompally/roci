/** A model's maker in the one tile: a known maker's logo tile, else its Hugging Face picture (cached, so it loads once)
 *  unaltered, else `fallback`. */

import React from 'react';
import { getAvatarUrl } from '@services/modelAvatars';
import { useCachedImage } from '@shared/hooks/useCachedImage';
import { IconTile, LIST_ART_PX } from '@shared/ui';
import { AI_LOGO, LOGOS, MAKER_BRANDS } from '@config/providerLogos.config';

interface ModelAvatarProps {
  org: string;
  /** Px; a list row's list-art size when left out. */
  size?: number;
  working?: boolean;
  /** Shown when the org's picture can't load (the provider's tile); the generic AI tile otherwise. */
  fallback?: React.ReactNode;
}

const OrgPicture: React.FC<Required<Pick<ModelAvatarProps, 'org' | 'size'>> & Pick<ModelAvatarProps, 'working' | 'fallback'>> = ({ org, size, working, fallback }) => {
  const { src, failed } = useCachedImage(getAvatarUrl(org));
  if (failed) return fallback ?? <IconTile logo={AI_LOGO} size={size} label={org} working={working} />;
  // Holds the space while the first load runs, so nothing shifts when the picture arrives.
  if (!src) return <span aria-hidden className="shrink-0" style={{ width: size, height: size }} />;
  return <IconTile logo={src} size={size} label={org} working={working} />;
};

export const ModelAvatar: React.FC<ModelAvatarProps> = ({ org, size = LIST_ART_PX, working, fallback }) => {
  const logo = LOGOS[MAKER_BRANDS[org.toLowerCase()] ?? ''];
  if (logo) return <IconTile logo={logo} size={size} label={org} working={working} />;
  return <OrgPicture org={org} size={size} working={working} fallback={fallback} />;
};
