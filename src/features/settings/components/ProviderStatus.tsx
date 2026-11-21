/** A provider's state on its Providers row (and onboarding): on and usable, on but not yet usable, or off. */

import React from 'react';
import { Status } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import { providerSetting } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';

/** On and usable (key set, server running), on but not usable yet, or off. */
export type ProviderRowState = 'ready' | 'attention' | 'off';

const ROW_DOT: Record<Exclude<ProviderRowState, 'off'>, DotTone> = { ready: 'success', attention: 'warning' };

const ROW_LABEL: Record<ProviderRowState, string> = { ready: 'On', attention: 'Needs key', off: 'Off' };

/** A cloud provider's state: off, on without a key, or on with one. */
export function cloudRowState(provider: ModelProvider): ProviderRowState {
  if (!provider.active) return 'off';
  return providerSetting(provider, 'api-key') ? 'ready' : 'attention';
}

/** A provider's state as a dot and word. */
export const ProviderStatus: React.FC<{ state: ProviderRowState }> = ({ state }) => (
  <Status tone={state === 'off' ? 'muted' : ROW_DOT[state]}>{ROW_LABEL[state]}</Status>
);
