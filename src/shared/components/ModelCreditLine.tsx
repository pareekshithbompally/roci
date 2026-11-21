/** Which models work on a meeting, each a badge with its logo ("Transcribed by [logo model] · Summarized by [logo model]"):
 *  the finished meeting's credit and the recording's models use this one line. */

import React, { useRef } from 'react';
import { Badge, ICON_SIZE_PX, Text } from '@shared/ui';
import { ModelIcon } from '@shared/components/ModelIcon';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { useLogoTint } from '@shared/hooks/useLogoTint';

/** A model that works on a meeting; `provider` is empty when the stored id doesn't name one. */
export interface ModelCredit {
  provider: string;
  model: string;
}

/** One model as a badge (the kit's, like the Recording one): its logo and id in a soft wash of the logo's own colour (a mono
 *  logo keeps the neutral pill); the provider on hover. */
export const ModelName: React.FC<{ credit: ModelCredit }> = ({ credit }) => {
  const logo = useRef<HTMLSpanElement>(null);
  const tint = useLogoTint(logo, [credit.provider, credit.model]);
  return (
    <Badge tinted dot={false} tint={tint} className="min-w-0" title={credit.provider ? getProviderTitle(credit.provider) : undefined}>
      {credit.provider && (
        <span ref={logo} className="inline-flex shrink-0">
          <ModelIcon provider={credit.provider} modelId={credit.model} size={ICON_SIZE_PX.xs} />
        </span>
      )}
      <span className="truncate">{credit.model}</span>
    </Badge>
  );
};

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
