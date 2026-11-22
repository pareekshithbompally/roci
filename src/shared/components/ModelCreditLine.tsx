/** Which models work on a meeting, each a ModelBadge ("Transcribed by [logo model] · Summarized by [logo model]"): the finished
 *  meeting's credit and the recording's models use this one line. */

import React from 'react';
import { Text } from '@shared/ui';
import { ModelBadge, type ModelCredit } from '@shared/components/ModelBadge';

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
          <ModelBadge {...credit} />
        </span>
      ))}
    </div>
  );
};
