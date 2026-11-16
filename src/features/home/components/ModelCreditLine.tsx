/** "Transcribed by [logo] model · Summarized by [logo] model" — which models made this meeting. */

import React from 'react';
import { ICON_SIZE_PX, Text } from '@shared/ui';
import { ModelIcon } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import type { ModelCredit } from '@features/home/hooks/useMeetingStats';

/** One model: its logo and id, the provider on hover. */
export const ModelName: React.FC<{ credit: ModelCredit }> = ({ credit }) => (
  <span className="inline-flex items-center gap-1.5 min-w-0" title={credit.provider ? getProviderTitle(credit.provider) : undefined}>
    {credit.provider && <ModelIcon provider={credit.provider} modelId={credit.model} size={ICON_SIZE_PX.xs} />}
    <Text variant="helper" tone="primary">{credit.model}</Text>
  </span>
);

interface ModelCreditLineProps {
  transcribedBy: ModelCredit | null;
  summarizedBy: ModelCredit | null;
}

export const ModelCreditLine: React.FC<ModelCreditLineProps> = ({ transcribedBy, summarizedBy }) => {
  if (!transcribedBy && !summarizedBy) return null;
  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
      {transcribedBy && (
        <span className="inline-flex items-center gap-1.5">
          <Text variant="helper" tone="muted">Transcribed by</Text>
          <ModelName credit={transcribedBy} />
        </span>
      )}
      {summarizedBy && (
        <span className="inline-flex items-center gap-1.5">
          <Text variant="helper" tone="muted">Summarized by</Text>
          <ModelName credit={summarizedBy} />
        </span>
      )}
    </div>
  );
};
