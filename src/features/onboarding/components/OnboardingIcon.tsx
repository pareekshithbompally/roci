/** One onboarding row or choice icon, whatever its source: drawn by macOS, a glyph on a tile, a bundled light/dark image, or a provider fan. */

import React from 'react';
import { AppIcon, AppImage, GlyphTile, ProviderFan } from '@shared/components';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import type { OnboardingIconSource } from '@config/onboarding.config';

const Glyph: React.FC<{ source: OnboardingIconSource }> = ({ source }) => {
  const { isDark } = useThemeContext();
  if ('app' in source) return <AppIcon app={source.app} size="xl" />;
  if ('providers' in source) return <ProviderFan providers={source.providers} />;
  if ('glyph' in source) return <GlyphTile src={source.glyph} />;
  return <AppImage src={isDark ? source.image.dark : source.image.light} size="xl" />;
};

/** Every icon centred in one slot as wide as the widest (the provider fan), so row titles line up. */
export const OnboardingIcon: React.FC<{ source: OnboardingIconSource }> = ({ source }) => (
  <span className="flex w-choice-icon shrink-0 justify-center"><Glyph source={source} /></span>
);
