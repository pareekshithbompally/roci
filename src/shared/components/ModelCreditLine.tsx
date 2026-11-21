/** Which models work on a meeting, each named with its logo ("Transcribed by [logo] model · Summarized by [logo] model"):
 *  the finished meeting's credit and the recording's models use this one line. */

import React from 'react';
import { ICON_SIZE_PX, Text } from '@shared/ui';
import { ModelIcon } from '@shared/components/ModelIcon';
import { getProviderTitle } from '@shared/utils/provider.utils';

/** A model that works on a meeting; `provider` is empty when the stored id doesn't name one. */
export interface ModelCredit {
  provider: string;
  model: string;
}

/** One model: its logo and id, the provider on hover. */
export const ModelName: React.FC<{ credit: ModelCredit }> = ({ credit }) => (
  <span className="inline-flex items-center gap-1.5 min-w-0" title={credit.provider ? getProviderTitle(credit.provider) : undefined}>
    {credit.provider && <ModelIcon provider={credit.provider} modelId={credit.model} size={ICON_SIZE_PX.xs} />}
    <Text variant="helper" tone="primary">{credit.model}</Text>
  </span>
);

/** A role and the model filling it; none = not set, left out. */
export interface ModelCreditItem {
  label: string;
  credit: ModelCredit | null;
}

export const ModelCreditLine: React.FC<{ credits: readonly ModelCreditItem[] }> = ({ credits }) => {
  const shown = credits.filter((item): item is ModelCreditItem & { credit: ModelCredit } => item.credit !== null);
  if (shown.length === 0) return null;
  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
      {shown.map(({ label, credit }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <Text variant="helper" tone="muted">{label}</Text>
          <ModelName credit={credit} />
        </span>
      ))}
    </div>
  );
};
