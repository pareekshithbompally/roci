/** ⋯ menu on a selected-model row: Rename, corrections to what the model can do (apply at once) and Remove (asks first). */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '@shared/ui';
import { Menu } from '@shared/components';
import { MENU_SYMBOLS } from '@config/ui.config';
import { FEATURES, type ModelProfile } from '@services/ai/models';
import { MODEL_MENU_COPY } from '@config/modelMenu.config';
import type { ModelOverrides } from '@shared/types/modelProviders';

/** Each correction: a feature the user can set, by its name, the override it sets, and whether the profile has it (the tick). */
const CORRECTIONS = FEATURES.flatMap(({ feature, override, has }) =>
  override ? [{ label: MODEL_MENU_COPY.features[feature], key: override, on: has }] : []);

interface ModelRowMenuProps {
  /** What the model can do now, from every source. */
  profile: ModelProfile;
  /** Saves a correction over what the sources say. */
  onOverride: (override: ModelOverrides) => void;
  onRename: () => void;
  onRemove: () => void;
}

export const ModelRowMenu: React.FC<ModelRowMenuProps> = ({ profile, onOverride, onRename, onRemove }) => (
  <Menu
    label="Model options"
    trigger={<IconButton icon={MoreHorizontal} label="Model options" size="sm" />}
    items={[
      { type: 'item', label: 'Rename…', symbol: MENU_SYMBOLS.rename, onSelect: onRename },
      { type: 'separator' },
      ...CORRECTIONS.map(({ label, key, on }) => ({
        type: 'check' as const,
        label,
        checked: on(profile),
        onSelect: () => onOverride({ [key]: !on(profile) }),
      })),
      { type: 'separator' },
      { type: 'item', label: 'Remove Model…', symbol: MENU_SYMBOLS.delete, onSelect: onRemove, destructive: true },
    ]}
  />
);
