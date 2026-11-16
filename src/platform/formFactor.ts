/** Layout class: `phone` (iPhone, narrow iPad split view; narrow browser for previews), `tablet` (iPad), `desktop` (Mac). */

import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { platform } from './index';

export type FormFactor = 'phone' | 'tablet' | 'desktop';

export function useFormFactor(): FormFactor {
  const small = useSmallScreen();
  if (platform.kind === 'macos') return 'desktop';
  if (small) return 'phone';
  return platform.kind === 'ios' ? 'tablet' : 'desktop';
}
