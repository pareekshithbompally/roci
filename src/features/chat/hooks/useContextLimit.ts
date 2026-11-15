/** Active chat model's context window in tokens, or null when unknown (callers hide the gauge). */

import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { capabilitiesOf } from '@services/ai/capabilities';

export function useContextLimit(): number | null {
  const { settings, providers } = useSettings();
  useModelCatalog();
  const resolved = resolveChatModel(settings, providers);
  return resolved ? capabilitiesOf(resolved.provider, resolved.model).contextTokens : null;
}
