/** One Providers sidebar row (logo, title, detail, status dot), shared by cloud providers and local servers. */

import React from 'react';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Dot, RowGroupLabel, Status, Surface, Text } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import { activateOnKey } from '@shared/utils/activateOnKey';
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

/** A provider's state as a dot and word (phone list rows). */
export const ProviderStatus: React.FC<{ state: ProviderRowState }> = ({ state }) => (
  <Status tone={state === 'off' ? 'muted' : ROW_DOT[state]}>{ROW_LABEL[state]}</Status>
);

interface ProviderListItemProps {
  provider: string;
  selected: boolean;
  state: ProviderRowState;
  onSelect: () => void;
  /** Second line under the title (e.g. "12 models", "Not running"). */
  detail?: string;
}

export const ProviderListItem: React.FC<ProviderListItemProps> = ({ provider, selected, state, onSelect, detail }) => (
  <Surface
    radius="md"
    interactive
    selected={selected}
    role="button"
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={activateOnKey(onSelect)}
    className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
  >
    <ProvidersAvatar provider={provider} size={20} />
    <span className="flex-1 min-w-0">
      <Text as="span" variant="bodyStrong" tone={state === 'off' ? 'faint' : undefined} truncate className="block">
        {getProviderTitle(provider)}
      </Text>
      {detail && <Text as="span" variant="helper" tone="faint" truncate className="block">{detail}</Text>}
    </span>
    {state !== 'off' && <Dot tone={ROW_DOT[state]} size="xs" />}
  </Surface>
);

interface ProviderGroupProps {
  title: string;
  /** Controls at the right of the label (Rescan, Add). */
  accessory?: React.ReactNode;
  children: React.ReactNode;
}

/** A labelled list of provider rows in the Providers sidebar. */
export const ProviderGroup: React.FC<ProviderGroupProps> = ({ title, accessory, children }) => (
  <section className="space-y-0.5">
    <div className="flex items-center justify-between gap-2">
      <RowGroupLabel>{title}</RowGroupLabel>
      {accessory && <span className="flex items-center gap-0.5">{accessory}</span>}
    </div>
    {children}
  </section>
);
