/** One onboarding row or choice icon: drawn by macOS, a logo tile, a bundled light/dark image, or a fan of provider logos. */

import React from 'react';
import { AppIcon, AppImage, IconFan } from '@shared/components';
import { logoOf } from '@shared/utils/provider.utils';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useIconArt } from '@shared/hooks';
import { ICON_SIZE_PX, IconTile } from '@shared/ui';
import type { OnboardingIconSource } from '@config/onboarding.config';

const Glyph: React.FC<{ source: OnboardingIconSource }> = ({ source }) => {
  const { isDark } = useThemeContext();
  const art = useIconArt();
  if ('app' in source) return <AppIcon app={source.app} size="xl" symbol={source.symbol} fallback={source.art && art(source.art)} />;
  if ('providers' in source) return <IconFan logos={source.providers.map((provider) => logoOf(provider))} />;
  if ('logo' in source) return <IconTile logo={source.logo} size={ICON_SIZE_PX.xl} />;
  return <AppImage src={isDark ? source.image.dark : source.image.light} size="xl" />;
};

/** Every icon centred in one slot as wide as the widest (the provider fan), so row titles line up. */
export const OnboardingIcon: React.FC<{ source: OnboardingIconSource }> = ({ source }) => (
  <span className="flex w-choice-icon shrink-0 justify-center"><Glyph source={source} /></span>
);
