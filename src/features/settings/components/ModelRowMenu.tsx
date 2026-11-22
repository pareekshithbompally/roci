/** ⋯ menu on a selected-model row: Rename, corrections to what the model can do (apply at once) and Remove (asks first). */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '@shared/ui';
import { Menu } from '@shared/components';
import { MENU_SYMBOLS } from '@config/ui.config';
import type { ModelProfile } from '@services/ai/models';
import type { ModelOverrides } from '@shared/types/modelProviders';

/** Each correction: its label, the override it sets, and whether the profile has it now (the tick). */
const CORRECTIONS: ReadonlyArray<{ label: string; key: keyof ModelOverrides; on: (p: ModelProfile) => boolean }> = [
  { label: 'Vision', key: 'vision', on: (p) => p.input.includes('image') },
  { label: 'Audio input', key: 'audio', on: (p) => p.input.includes('audio') },
  { label: 'PDF input', key: 'pdf', on: (p) => p.input.includes('pdf') },
  { label: 'Tool calling', key: 'tools', on: (p) => p.tools },
  { label: 'Thinking', key: 'reasoning', on: (p) => p.reasoning },
];

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
