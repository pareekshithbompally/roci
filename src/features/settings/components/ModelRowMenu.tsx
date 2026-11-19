/** ⋯ menu on a selected-model row: Rename, corrections to what the model can do (apply at once) and Remove (asks first). */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '@shared/ui';
import { Menu } from '@shared/components';
import { MENU_SYMBOLS } from '@config/ui.config';
import type { Modality } from '@config/modelSpine.config';
import type { ModelProfile } from '@services/ai/models';
import type { ModelReport } from '@shared/types/modelProviders';

/** The input list with one modality turned on or off. */
const toggled = (input: Modality[], modality: Modality): Modality[] =>
  input.includes(modality) ? input.filter((m) => m !== modality) : [...input, modality];

/** Each correction: its label, whether the profile has it now, and the override that flips it. */
const CORRECTIONS: ReadonlyArray<{ label: string; on: (p: ModelProfile) => boolean; flip: (p: ModelProfile) => ModelReport }> = [
  { label: 'Vision', on: (p) => p.input.includes('image'), flip: (p) => ({ input: toggled(p.input, 'image') }) },
  { label: 'Audio input', on: (p) => p.input.includes('audio'), flip: (p) => ({ input: toggled(p.input, 'audio') }) },
  { label: 'Tool calling', on: (p) => p.tools, flip: (p) => ({ tools: !p.tools }) },
  { label: 'Thinking', on: (p) => p.reasoning, flip: (p) => ({ reasoning: !p.reasoning }) },
];

interface ModelRowMenuProps {
  /** What the model can do now, from every source. */
  profile: ModelProfile;
  /** Saves a correction over what the sources say. */
  onOverride: (override: ModelReport) => void;
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
      ...CORRECTIONS.map(({ label, on, flip }) => ({
        type: 'check' as const,
        label,
        checked: on(profile),
        onSelect: () => onOverride(flip(profile)),
      })),
      { type: 'separator' },
      { type: 'item', label: 'Remove Model…', symbol: MENU_SYMBOLS.delete, onSelect: onRemove, destructive: true },
    ]}
  />
);
