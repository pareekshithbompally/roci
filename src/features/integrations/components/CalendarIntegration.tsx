/**
 * CalendarIntegration — macOS Calendar: meeting notifications and auto-record.
 */

import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button, CardRow, Icon, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';
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
      icon={<IntegrationIcon src={COPY.icon} alt="" />}
      title={COPY.title}
      description={COPY.description}
      deniedHint={COPY.deniedHint}
    >
      <CardRow
        title="Notify before meeting starts"
        actions={
          <div className="w-36">
            <Select
              value={String(calendar.notifyMinutesBefore)}
              onValueChange={(value) => calendar.setNotifyMinutesBefore(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COPY.notifyOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
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
