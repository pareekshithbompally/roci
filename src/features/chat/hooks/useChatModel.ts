/** The model the open chat runs on: the one it is locked to (its first reply's), or the chat model setting for a new chat. */

import { useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { resolveChatModel } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { useChatModelLock } from '@features/chat/stores';

export function useChatModel(): ResolvedModel | null {
  const { settings, providers } = useSettings();
  const locked = useChatModelLock();
  return useMemo(() => resolveChatModel(settings, providers, locked ?? undefined), [settings, providers, locked]);
}
