/** Settings › Usage: two tabs in the page header — Activity (what was used and what it cost) and Prices (what each model costs). */

import React from 'react';
import { Tabs } from '@shared/ui';
import { USAGE_CONFIG } from '@config/usage.config';
import { SettingsPage } from '@features/settings/components/shared/SettingsPage';
import { useSetUsageTab, useUsageTab } from '@features/usage/stores/usageStore';
import { ActivityTab } from './ActivityTab';
import { PricesTab } from './PricesTab';

export const UsagePanel: React.FC = () => {
  const tab = useUsageTab();
  const setTab = useSetUsageTab();
  return (
    <SettingsPage
      pane="usage"
      accessory={<Tabs items={USAGE_CONFIG.tabs} value={tab} onValueChange={setTab} label="Usage view" />}
    >
      {tab === 'activity' ? <ActivityTab /> : <PricesTab />}
    </SettingsPage>
  );
};
