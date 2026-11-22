/** A model as a badge (the kit's, like the Recording one): its logo and id in a soft wash of the logo's own colour (a mono
 *  logo keeps the neutral pill); the provider on hover. Every user-facing view that names a model shows it this way. */

import React, { useRef } from 'react';
import { parseModelKey } from '@services/ai/models';
import { Badge, ICON_SIZE_PX } from '@shared/ui';
import { ModelIcon } from '@shared/components/ModelIcon';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { useLogoTint } from '@shared/hooks/useLogoTint';

/** A model that did some work. */
export interface ModelCredit {
  provider: string;
  model: string;
}

/** A stored model key as a credit; null when none is stored. */
export function modelCreditOf(stored: string | undefined): ModelCredit | null {
  return stored ? parseModelKey(stored) : null;
}

export const ModelBadge: React.FC<ModelCredit> = ({ provider, model }) => {
  const logo = useRef<HTMLSpanElement>(null);
  const tint = useLogoTint(logo, [provider, model]);
  return (
    <Badge tinted dot={false} tint={tint} className="min-w-0" title={getProviderTitle(provider)}>
      <span ref={logo} className="inline-flex shrink-0">
        <ModelIcon provider={provider} modelId={model} size={ICON_SIZE_PX.xs} />
      </span>
      <span className="truncate">{model}</span>
    </Badge>
  );
};
