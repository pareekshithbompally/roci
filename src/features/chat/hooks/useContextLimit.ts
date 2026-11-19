/** The open chat's model's context window in tokens, or null when unknown (callers hide the gauge). */

import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { profileOf } from '@services/ai/models';
import { useChatModel } from './useChatModel';

export function useContextLimit(): number | null {
  useModelCatalog();
  const resolved = useChatModel();
  return resolved ? profileOf(resolved.provider, resolved.model).contextTokens : null;
}
