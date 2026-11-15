/**
 * IntegrationsPanel — every integration as one row in a grouped card
 * (rows, permissions and settings come from features/integrations).
 */

import React from 'react';
import { Section } from '@shared/ui';
import { AppleIntelligenceIntegration, AppleNotesIntegration, CalendarIntegration, CodingAgentsIntegration, HexIntegration, RemindersIntegration, SpotlightIntegration, UrlActionsIntegration } from '@features/integrations';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { SettingsPage } from './shared';

export const IntegrationsPanel: React.FC = () => (
  <SettingsPage title="Integrations" description="Connect Kasset to apps on this Mac.">
    <Section title="macOS" layout="stack">
      <AppleIntelligenceIntegration />
      <CalendarIntegration />
      <RemindersIntegration />
      <AppleNotesIntegration />
      <SpotlightIntegration />
    </Section>
    <Section title="Apps" layout="stack">
      <HexIntegration />
    </Section>
    <Section title={INTEGRATIONS_CONFIG.codingAgents.section}>
      <CodingAgentsIntegration />
    </Section>
    <Section title={INTEGRATIONS_CONFIG.urlActions.section}>
      <UrlActionsIntegration />
    </Section>
  </SettingsPage>
);
