/** One onboarding row or choice icon, whatever its source: drawn by macOS, a glyph on a tile, a bundled light/dark image, or
 *  a fan of provider or engine logos. */

import React from 'react';
import { AppIcon, AppImage, GlyphTile, IconFan, ProvidersAvatar } from '@shared/components';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useIconArt } from '@shared/hooks';
import { ICON_SIZE_PX } from '@shared/ui';
import type { OnboardingIconSource } from '@config/onboarding.config';

const Glyph: React.FC<{ source: OnboardingIconSource }> = ({ source }) => {
  const { isDark } = useThemeContext();
  const art = useIconArt();
  if ('app' in source) return <AppIcon app={source.app} size="xl" symbol={source.symbol} fallback={source.art && art(source.art)} />;
  if ('providers' in source) {
    return <IconFan tiles={source.providers.map((provider) => ({ key: provider, logo: (size) => <ProvidersAvatar provider={provider} size={ICON_SIZE_PX[size]} /> }))} />;
  }
  if ('engines' in source) {
    return (
      <IconFan
        tiles={source.engines.map((engine) => ({
          key: engine.name,
          logo: (size) => <AppImage src={isDark ? engine.dark : engine.light} size={size} />,
        }))}
      />
    );
  }
  if ('glyph' in source) return <GlyphTile src={source.glyph} />;
  return <AppImage src={isDark ? source.image.dark : source.image.light} size="xl" />;
};

/** Every icon centred in one slot as wide as the widest (the provider fan), so row titles line up. */
export const OnboardingIcon: React.FC<{ source: OnboardingIconSource }> = ({ source }) => (
  <span className="flex w-choice-icon shrink-0 justify-center"><Glyph source={source} /></span>
);
