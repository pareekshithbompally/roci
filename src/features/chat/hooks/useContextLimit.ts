/** The open chat's model's context window in tokens, or null when unknown (callers hide the gauge). */

import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { capabilitiesOf } from '@services/ai/capabilities';
import { useChatModel } from './useChatModel';

export function useContextLimit(): number | null {
  useModelCatalog();
  const resolved = useChatModel();
  return resolved ? capabilitiesOf(resolved.provider, resolved.model).contextTokens : null;
}
