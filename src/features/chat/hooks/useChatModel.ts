/** The model the open chat runs on: the one it is locked to (its first answer's), or the chat model setting for a new chat.
 *  Follows the local models as the picker does, so a model added or deleted on this Mac shows at once. */

import { useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { resolveChatModel } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { useChatModelLock } from '@features/chat/stores';

export function useChatModel(): ResolvedModel | null {
  const { settings, providers } = useSettings();
  const { data: localModels } = useLocalModels();
  const locked = useChatModelLock();
  return useMemo(
    () => resolveChatModel(settings, providers, locked ?? undefined, localModels),
    [settings, providers, locked, localModels],
  );
}
