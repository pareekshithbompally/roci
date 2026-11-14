/**
 * ProviderListItem
 *
 * One row of the Providers sidebar: logo, title, optional status line, and the
 * on/off switch. Shared by cloud providers and local servers so both lists look
 * and behave the same. `ProviderGroup` is the labelled list around them.
 */

import React from 'react';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { Dot, RowGroupLabel, Surface, Switch, Text } from '@shared/ui';
import { activateOnKey } from './shared';

export type ProviderStatus = 'running' | 'stopped';

interface ProviderListItemProps {
  provider: string;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
  /** Second line under the title (e.g. "12 models", "Not running"). */
  detail?: string;
  status?: ProviderStatus;
}

export const ProviderListItem: React.FC<ProviderListItemProps> = ({
  provider,
  selected,
  active,
  onSelect,
  onToggle,
  detail,
  status,
}) => {
  const title = getProviderTitle(provider);
  return (
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
        <Text as="span" variant="bodyStrong" truncate className="block">{title}</Text>
        {detail && (
          <Text as="span" variant="helper" tone="faint" className="flex items-center gap-1.5 truncate">
            {status && <Dot tone={status === 'running' ? 'success' : 'muted'} size="xs" />}
            {detail}
          </Text>
        )}
      </span>
      <div onClick={(e) => e.stopPropagation()}>
        <Switch size="sm" checked={active} onCheckedChange={onToggle} aria-label={`Toggle ${title}`} />
      </div>
    </Surface>
  );
};

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
