/** macOS Reminders: action items ↔ a reminders list. */

import React from 'react';
import { CardRow, Picker } from '@shared/ui';
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
      icon={<IntegrationIcon app={COPY.app} />}
      title={COPY.title}
      description={COPY.description}
      deniedHint={COPY.deniedHint}
    >
      <CardRow
        title="List"
        actions={
          <div className="w-44">
            <Picker
              label="Reminders list"
              value={reminders.listId}
              onChange={reminders.setListId}
              placeholder={COPY.defaultListTitle}
              groups={[{ options: reminders.lists.map((list) => ({ value: list.id, label: list.title })) }]}
            />
          </div>
        }
      />
    </IntegrationRow>
  );
};
