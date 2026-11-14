/**
 * useContextLimit Hook (chat feature)
 *
 * Resolves the active chat model's context window in tokens via
 * `capabilitiesOf(...).contextTokens`, using the same `resolveChatModel`
 * path the send flow uses. Derived synchronously; `useModelCatalog`
 * re-renders it when the models.dev cache arrives.
 *
 * Returns null while the catalog loads or when the model reports no limit
 * (e.g. local-server models with no models.dev entry) — callers treat null
 * as "unknown, hide the gauge".
 */

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
