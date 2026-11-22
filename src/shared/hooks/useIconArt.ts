/** Icon Composer art (Settings panes, onboarding features, About), rendered light and dark from
 *  docs/design/pane-icons: the image for `name` in the current appearance. */

import { useThemeContext } from '@shared/contexts/ThemeContext';
import { UI_CONFIG } from '@config/ui.config';

export function useIconArt(): (name: string) => string {
  const { isDark } = useThemeContext();
  return (name) => `${UI_CONFIG.settingsArt}/${name}-${isDark ? 'dark' : 'light'}.webp`;
}
