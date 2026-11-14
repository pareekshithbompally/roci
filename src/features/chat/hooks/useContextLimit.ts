/**
 * useContextLimit Hook (chat feature)
 *
 * Resolves the active chat model's context window in tokens via
 * `modalitiesService.getModelContextLimit`, using the same
 * `resolveChatModel` path the send flow uses.
 *
 * Returns null while loading or when the model reports no limit (e.g.
 * local-server models with no models.dev entry) — callers treat null as
 * "unknown, hide the gauge".
 */

import { useEffect, useState } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { modalitiesService } from '@services/modalities';

export function useContextLimit(): number | null {
  const { settings, providers } = useSettings();
  const [limit, setLimit] = useState<number | null>(null);

  const chatModel = settings.chatModel;

  useEffect(() => {
    if (!chatModel) {
      setLimit(null);
      return;
    }
    let cancelled = false;
    modalitiesService
      .ensureLoaded()
      .then(() => {
        if (cancelled) return;
        const resolved = settings ? resolveChatModel(settings, providers) : null;
        setLimit(
          resolved ? modalitiesService.getModelContextLimit(resolved.provider, resolved.modelId) : null
        );
      })
      .catch(() => {
        if (!cancelled) setLimit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chatModel, providers, settings]);

  return limit;
}
