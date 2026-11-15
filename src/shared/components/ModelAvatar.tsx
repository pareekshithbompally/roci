/** A model's Hugging Face org icon (cached, so it loads once), else a monogram when the org has none. */

import React from 'react';
import { MODEL_AVATARS_CONFIG } from '@config/modelAvatars.config';
import { getAvatarUrl, orgHue } from '@services/modelAvatars';
import { useCachedImage } from '@shared/hooks/useCachedImage';

interface ModelAvatarProps {
  org: string;
  size: number;
}

export const ModelAvatar: React.FC<ModelAvatarProps> = ({ org, size }) => {
  const { src, failed } = useCachedImage(getAvatarUrl(org));
  const box = { width: size, height: size };

  if (failed) {
    const { monogramSaturation: s, monogramLightness: l } = MODEL_AVATARS_CONFIG;
    return (
      <span
        aria-hidden
        className="shrink-0 rounded-full inline-flex items-center justify-center font-semibold leading-none text-on-accent"
        style={{ ...box, fontSize: size / 2, backgroundColor: `hsl(${orgHue(org)} ${s}% ${l}%)` }}
      >
        {org.charAt(0).toUpperCase()}
      </span>
    );
  }

  // Holds the space while the first load runs, so nothing shifts when the icon arrives.
  if (!src) return <span aria-hidden className="shrink-0" style={box} />;

  const darkLogo = (MODEL_AVATARS_CONFIG.darkLogoOrgs as readonly string[]).includes(org.toLowerCase());
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`shrink-0 rounded-full object-cover ${darkLogo ? '[filter:var(--logo-filter)]' : ''}`}
      style={box}
    />
  );
};
