/** A setting's name with its ⓘ: what it does, in a popover (a sheet on iPhone). */

import React from 'react';
import { HelpTip } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';

export const HelpLabel: React.FC<{ label: string; help: string }> = ({ label, help }) => (
  <span className="flex items-center gap-1">
    {label}
    <HelpTip title={label} label={KIT_COPY.aboutSetting(label)}>{help}</HelpTip>
  </span>
);
