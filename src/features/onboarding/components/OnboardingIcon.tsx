/** One onboarding row or choice icon, whatever its source: drawn by macOS, a bundled light/dark image, or a provider fan. */

import React from 'react';
import { AppIcon, AppImage, ProviderFan } from '@shared/components';
import { useTheme } from '@shared/hooks/useTheme';
import type { OnboardingIconSource } from '@config/onboarding.config';

export const OnboardingIcon: React.FC<{ source: OnboardingIconSource }> = ({ source }) => {
  const { isDark } = useTheme();
  if ('app' in source) return <AppIcon app={source.app} size="xl" />;
  if ('providers' in source) return <ProviderFan providers={source.providers} />;
  return <AppImage src={isDark ? source.image.dark : source.image.light} size="xl" />;
};
