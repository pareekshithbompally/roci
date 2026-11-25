/** Every integration this device has, one row each (Apple Intelligence is a model source: Providers › On this device). */

import React from 'react';
import { Section } from '@shared/ui';
import { AppleNotesIntegration, CalendarIntegration, CodingAgentsIntegration, HexIntegration, RemindersIntegration, SpotlightIntegration, UrlActionsIntegration } from '@features/integrations';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { platform } from '@platform/index';
import { isIntegrationAvailable, type IntegrationId } from '@shared/utils/integrations';
import { SettingsPage } from './shared';

/** The system integrations in display order; a device shows the ones it has. */
const SYSTEM_ROWS: ReadonlyArray<readonly [IntegrationId, React.FC]> = [
  ['calendar', CalendarIntegration],
  ['reminders', RemindersIntegration],
  ['appleNotes', AppleNotesIntegration],
  ['spotlight', SpotlightIntegration],
];
const systemRows = SYSTEM_ROWS.filter(([id]) => isIntegrationAvailable(id));

/** A panel group: title, stack (each integration is its own group) or one card, content. */
interface Group { key: string; title: string; layout: 'stack' | 'card'; content: React.ReactNode; footer?: string }

/** The panel's groups on this device, in display order. */
const candidates: ReadonlyArray<Group | false> = [
  systemRows.length > 0 && { key: 'system', title: platform.systemName, layout: 'stack', content: systemRows.map(([id, Row]) => <Row key={id} />) },
  isIntegrationAvailable('hex') && { key: 'apps', title: 'Apps', layout: 'stack', content: <HexIntegration /> },
  platform.hasCodingAgents && { key: 'agents', title: INTEGRATIONS_CONFIG.codingAgents.section, layout: 'stack', content: <CodingAgentsIntegration /> },
  platform.hasUrlActions && { key: 'urls', title: INTEGRATIONS_CONFIG.urlActions.section, layout: 'card', content: <UrlActionsIntegration />, footer: INTEGRATIONS_CONFIG.urlActions.footer },
];
const groups = candidates.filter((g): g is Group => g !== false);

/** Whether this device has any integration, so the panel is worth showing. */
export const hasIntegrations = groups.length > 0;

// A lone group needs no heading.
const titled = groups.length > 1;

export const IntegrationsPanel: React.FC = () => (
  <SettingsPage pane="integrations">
    {groups.map((g) => (
      <Section key={g.key} title={titled ? g.title : undefined} layout={g.layout} footer={g.footer}>{g.content}</Section>
    ))}
  </SettingsPage>
);
