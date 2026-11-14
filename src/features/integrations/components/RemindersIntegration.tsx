/**
 * RemindersIntegration — macOS Reminders: action items ↔ a reminders list.
 */

import React from 'react';
import { CardRow, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useRemindersControls } from '@features/integrations/hooks/useRemindersControls';
import { IntegrationRow } from './IntegrationRow';
import { IntegrationIcon } from './IntegrationIcon';

const COPY = INTEGRATIONS_CONFIG.reminders;

export const RemindersIntegration: React.FC = () => {
  const reminders = useRemindersControls();

  return (
    <IntegrationRow
      {...reminders}
      icon={<IntegrationIcon src={COPY.icon} alt="" />}
      title={COPY.title}
      description={COPY.description}
      deniedHint={COPY.deniedHint}
    >
      <CardRow
        title="List"
        description="New action items go here."
        actions={
          <div className="w-44">
            <Select value={reminders.listId} onValueChange={reminders.setListId}>
              <SelectTrigger>
                <SelectValue placeholder={COPY.defaultListTitle} />
              </SelectTrigger>
              <SelectContent>
                {reminders.lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>{list.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
    </IntegrationRow>
  );
};
