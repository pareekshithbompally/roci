/**
 * ModelAvatar — a model's Hugging Face org icon, with a monogram fallback.
 *
 * Same size API as ProvidersAvatar. Lazy-loaded remote image; on failure the
 * org shows its monogram and isn't retried until the cooldown passes
 * (module-level, shared by every row and header).
 */

import React, { useState } from 'react';
import { MODEL_AVATARS_CONFIG } from '@config/modelAvatars.config';
import { getAvatarUrl, orgHue } from '@services/modelAvatars';

const failedAt = new Map<string, number>();

function recentlyFailed(org: string): boolean {
  const at = failedAt.get(org);
  return at !== undefined && Date.now() - at < MODEL_AVATARS_CONFIG.failureCooldownMs;
}

interface ModelAvatarProps {
  org: string;
  size: number;
}

export const ModelAvatar: React.FC<ModelAvatarProps> = ({ org, size }) => {
  const [failed, setFailed] = useState(() => recentlyFailed(org));
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

  const darkLogo = (MODEL_AVATARS_CONFIG.darkLogoOrgs as readonly string[]).includes(org.toLowerCase());
  return (
    <img
      src={getAvatarUrl(org)}
      alt=""
      loading="lazy"
      draggable={false}
      className={`shrink-0 rounded-full object-cover ${darkLogo ? '[filter:var(--logo-filter)]' : ''}`}
      style={box}
      onError={() => {
        failedAt.set(org, Date.now());
        setFailed(true);
      }}
    />
  );
};
