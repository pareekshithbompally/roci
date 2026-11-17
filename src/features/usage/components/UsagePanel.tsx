/** Settings › Usage: the root page, or (Mac, iPad) the page drilled into; a phone pushes pages onto its NavStack instead. */

import React, { useEffect } from 'react';
import { useOptionalNavStack } from '@shared/ui';
import { useResetUsagePath, useUsagePath } from '@features/usage/stores/usageStore';
import { ALL_USAGE } from '@features/usage/model/subject';
import { UsageDetail } from './UsageDetail';

export const UsagePanel: React.FC = () => {
  const inStack = useOptionalNavStack() !== null;
  const path = useUsagePath();
  const reset = useResetUsagePath();
  // Leaving the panel closes any drilled-in page, so Usage always reopens at its overview.
  useEffect(() => reset, [reset]);

  const subject = (inStack ? undefined : path[path.length - 1]) ?? ALL_USAGE;
  return <UsageDetail key={JSON.stringify(subject)} subject={subject} />;
};
