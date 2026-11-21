/** Whether the sidebar's buttons float over the content's top-left, beside the macOS traffic lights (the sidebar is collapsed,
 *  or a drawer on a small window): a view's toolbar then starts after them. */

import { platform } from '@platform/index';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';

export function useFloatingSidebarControls(): boolean {
  const open = useLeftPanel((s) => s.open);
  const small = useSmallScreen();
  return platform.hasWindowChrome && (small || !open);
}
