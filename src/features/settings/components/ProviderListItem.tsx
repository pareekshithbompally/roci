/**
 * ProviderListItem
 *
 * One row of the Providers sidebar: logo, title, optional status line, and the
 * on/off toggle. Shared by cloud providers and local servers so both lists look
 * and behave the same.
 */

import React from 'react';
import ProvidersAvatar from '@shared/components/ProvidersAvatar';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS, COMPONENT } from '@config/theme.config';
import { Toggle } from './shared';

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
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-3 py-2 ${RADIUS.md} text-left transition-all border ${
        selected
          ? `${SURFACE.selectedCard} ${BORDER.selectedCard}`
          : `${SURFACE.card} ${BORDER.default} ${BORDER.cardHover}`
      }`}
    >
      <ProvidersAvatar provider={provider} size={20} />
      <span className="flex-1 min-w-0">
        <span className={`block truncate ${TYPOGRAPHY_CLASSES.settingsInputLabel} ${selected ? TEXT.heading : TEXT.primary}`}>
          {title}
        </span>
        {detail && (
          <span className={`flex items-center gap-1.5 truncate ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
            {status && (
              <span className={status === 'running' ? COMPONENT.statusDotRunning : COMPONENT.statusDotStopped} />
            )}
            {detail}
          </span>
        )}
      </span>
      <div onClick={(e) => e.stopPropagation()}>
        <Toggle checked={active} onChange={onToggle} label={`Toggle ${title}`} />
      </div>
    </button>
  );
};
