/** The app a meeting came from, before its title: Hex's own icon for a meeting imported from Hex, Roci's mark for the rest
 *  (recorded or imported in Roci). Hovering names it. */

import React from 'react';
import { AppMark, Tooltip } from '@shared/ui';
import { AppIcon } from '@shared/components';
import { HEX_INPUT_SOURCE } from '@services/hex';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';

const FROM = { hex: 'From Hex', roci: 'From Roci' } as const;

export const MeetingSourceIcon: React.FC<{ inputSource?: string }> = ({ inputSource }) => {
  const fromHex = inputSource === HEX_INPUT_SOURCE;
  return (
    <Tooltip content={fromHex ? FROM.hex : FROM.roci}>
      <span className="inline-flex shrink-0">
        {fromHex ? <AppIcon app={INTEGRATIONS_CONFIG.hex.app} fallback={INTEGRATIONS_CONFIG.hex.icon} size="lg" /> : <AppMark size="lg" />}
      </span>
    </Tooltip>
  );
};
