/**
 * ModelRowMenu — the ⋯ menu on a provider's selected-model row:
 * a Tool calling toggle (applies at once) and Remove (asks first).
 */

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

interface ModelRowMenuProps {
  toolsEnabled: boolean;
  onToolsChange: (enabled: boolean) => void;
  onRemove: () => void;
}

export const ModelRowMenu: React.FC<ModelRowMenuProps> = ({ toolsEnabled, onToolsChange, onRemove }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <IconButton icon={MoreHorizontal} label="Model options" size="sm" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuCheckboxItem checked={toolsEnabled} onCheckedChange={(checked) => onToolsChange(checked === true)}>
        Tool calling
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="danger" onSelect={onRemove}>
        Remove model…
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
