/** Settings › Usage: one page, as Screen Time lays its activity out (UsageOverview); a model, a use case, the tools and the
 *  prices open as their own pages, pushed on iPhone and in place of the pane on Mac (usePaneDrill). */

import React from 'react';
import { SettingsPage, usePaneDrill } from '@features/settings/components/shared';
import { UsageOverview } from './UsageOverview';

export const UsagePanel: React.FC = () => {
  const drill = usePaneDrill();
  if (drill.view) return drill.view;
  return (
    <SettingsPage pane="usage" onForward={drill.forward}>
      <UsageOverview open={drill.open} />
    </SettingsPage>
  );
};
