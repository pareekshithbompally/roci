/** A usage table's model cell (Models, Prices): the model's icon and name, a quiet line under them (its provider, …). */

import React from 'react';
import { Text } from '@shared/ui';
import { ModelIcon } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';

interface ModelCellProps {
  provider: string;
  modelId: string;
  name: string;
  caption: React.ReactNode;
}

export const ModelCell: React.FC<ModelCellProps> = ({ provider, modelId, name, caption }) => (
  <div className="flex min-w-0 items-center gap-2">
    <ModelIcon provider={provider} modelId={modelId} size={UI_CONFIG.chart.rowIcon} />
    <div className="flex min-w-0 flex-col">
      <Text truncate>{name}</Text>
      <Text variant="caption" tone="muted" truncate>{caption}</Text>
    </div>
  </div>
);
