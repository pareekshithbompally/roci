/** A provider's state on its Providers row (and onboarding): on and usable, on but not yet usable, or off. */

import React from 'react';
import { Status } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import { providerSetting } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';

/** On and usable (key set, server running), on but not usable yet, or off. */
export type ProviderRowState = 'ready' | 'attention' | 'off';

const ROW_TONE: Record<ProviderRowState, DotTone> = { ready: 'success', attention: 'warning', off: 'muted' };

const ROW_LABEL: Record<ProviderRowState, string> = { ready: 'On', attention: 'Needs key', off: 'Off' };

/** A cloud provider's state: off, on without a key, or on with one. */
export function cloudRowState(provider: ModelProvider): ProviderRowState {
  if (!provider.active) return 'off';
  return providerSetting(provider, 'api-key') ? 'ready' : 'attention';
}

/** A provider's state as a dot and a word, or a server's own line ("localhost:11434 · 5 models") in the state's colour. */
export const ProviderStatus: React.FC<{ state: ProviderRowState; label?: string }> = ({ state, label }) => (
  <Status tone={ROW_TONE[state]}>{label ?? ROW_LABEL[state]}</Status>
);
