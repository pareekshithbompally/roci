/** ⋯ menu on a selected-model row: capability toggles (apply at once) and Remove (asks first). */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@shared/ui';
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
  onRemove: () => void;
}

export const ModelRowMenu: React.FC<ModelRowMenuProps> = ({ capabilities, onFlagChange, onRemove }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <IconButton icon={MoreHorizontal} label="Model options" size="sm" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {FLAG_ITEMS.map(({ flag, capability, label }) => (
        <DropdownMenuCheckboxItem
          key={flag}
          checked={capabilities[capability]}
          onCheckedChange={(checked) => onFlagChange(flag, checked === true)}
        >
          {label}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="danger" onSelect={onRemove}>
        Remove model…
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
