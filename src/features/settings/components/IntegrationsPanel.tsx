/** Every integration as one row in a grouped card (rows come from features/integrations); only those this device has. */

import React from 'react';
import { Section } from '@shared/ui';
import { AppleIntelligenceIntegration, AppleNotesIntegration, CalendarIntegration, CodingAgentsIntegration, HexIntegration, RemindersIntegration, SpotlightIntegration, UrlActionsIntegration } from '@features/integrations';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { platform } from '@platform/index';
import { isIntegrationAvailable, type IntegrationId } from '@shared/utils/integrations';
import { SettingsPage } from './shared';

/** The system integrations in display order; a device shows the ones it has. */
const SYSTEM_ROWS: ReadonlyArray<readonly [IntegrationId, React.FC]> = [
  ['appleIntelligence', AppleIntelligenceIntegration],
  ['calendar', CalendarIntegration],
  ['reminders', RemindersIntegration],
  ['appleNotes', AppleNotesIntegration],
  ['spotlight', SpotlightIntegration],
];
const systemRows = SYSTEM_ROWS.filter(([id]) => isIntegrationAvailable(id));

/** Whether this device has any integration, so the panel is worth showing. */
export const hasIntegrations =
  systemRows.length > 0 || isIntegrationAvailable('hex') || platform.hasCodingAgents || platform.hasUrlActions;

export const IntegrationsPanel: React.FC = () => (
  <SettingsPage title="Integrations" description={`Connect Roci to apps on this ${platform.deviceName}.`}>
    {systemRows.length > 0 && (
      <Section title={platform.systemName} layout="stack">
        {systemRows.map(([id, Row]) => <Row key={id} />)}
      </Section>
    )}
    {isIntegrationAvailable('hex') && (
      <Section title="Apps" layout="stack">
        <HexIntegration />
      </Section>
    )}
    {platform.hasCodingAgents && (
      <Section title={INTEGRATIONS_CONFIG.codingAgents.section}>
        <CodingAgentsIntegration />
      </Section>
    )}
    {platform.hasUrlActions && (
      <Section title={INTEGRATIONS_CONFIG.urlActions.section}>
        <UrlActionsIntegration />
      </Section>
    )}
  </SettingsPage>
);
