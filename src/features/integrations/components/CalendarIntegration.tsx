/** macOS Calendar connection and week view; meeting reminders are switched in Settings › Notifications. */

import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button, CardRow, Icon } from '@shared/ui';
import { useAppActions } from '@shared/stores/appStore';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useCalendarControls } from '@features/integrations/hooks/useCalendarControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.calendar;

export const CalendarIntegration: React.FC = () => {
  const calendar = useCalendarControls();
  const { setCurrentView } = useAppActions();

  return (
    <IntegrationRow
      {...calendar}
      icon={<IntegrationIcon app={COPY.app} symbol={COPY.symbol} />}
      title={COPY.title}
      description={COPY.description}
      deniedHint={COPY.deniedHint}
    >
      <CardRow
        title="Your upcoming week"
        actions={
          <Button variant="outline" size="sm" onClick={() => setCurrentView('calendar')}>
            <Icon icon={CalendarDays} size="xs" />
            View Schedule
          </Button>
        }
      />
    </IntegrationRow>
  );
};
