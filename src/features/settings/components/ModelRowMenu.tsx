/** ⋯ menu on a selected-model row: Rename, capability toggles (apply at once) and Remove (asks first). */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '@shared/ui';
import { Menu } from '@shared/components';
import type { ModelCapabilities } from '@services/ai/capabilities';
import type { Model } from '@shared/types/modelProviders';

/** Per-model boolean overrides the menu can write. */
export type ModelCapabilityFlag = keyof Pick<Model, 'toolsEnabled' | 'audioInput'>;

const FLAG_ITEMS: ReadonlyArray<{ flag: ModelCapabilityFlag; capability: 'tools' | 'audioInput'; label: string }> = [
  { flag: 'toolsEnabled', capability: 'tools', label: 'Tool calling' },
  { flag: 'audioInput', capability: 'audioInput', label: 'Audio input' },
];

interface ModelRowMenuProps {
  /** Effective capabilities (override → models.dev → provider default). */
  capabilities: ModelCapabilities;
  onFlagChange: (flag: ModelCapabilityFlag, value: boolean) => void;
  onRename: () => void;
  onRemove: () => void;
}

export const ModelRowMenu: React.FC<ModelRowMenuProps> = ({ capabilities, onFlagChange, onRename, onRemove }) => (
  <Menu
    label="Model options"
    trigger={<IconButton icon={MoreHorizontal} label="Model options" size="sm" />}
    items={[
      { type: 'item', label: 'Rename…', onSelect: onRename },
      { type: 'separator' },
      ...FLAG_ITEMS.map(({ flag, capability, label }) => ({
        type: 'check' as const,
        label,
        checked: capabilities[capability],
        onSelect: () => onFlagChange(flag, !capabilities[capability]),
      })),
      { type: 'separator' },
      { type: 'item', label: 'Remove Model…', onSelect: onRemove, destructive: true },
    ]}
  />
);
