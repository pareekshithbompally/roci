/**
 * IntegrationsPanel — every integration as one row in a grouped card
 * (rows, permissions and settings come from features/integrations).
 */

import React from 'react';
import { Section } from '@shared/ui';
import { AppleIntelligenceIntegration, CalendarIntegration, HexIntegration, RemindersIntegration } from '@features/integrations';
import { SettingsPage } from './shared';

export const IntegrationsPanel: React.FC = () => (
  <SettingsPage title="Integrations" description="Connect Kasset to apps on this Mac.">
    <Section title="macOS" layout="stack">
      <AppleIntelligenceIntegration />
      <CalendarIntegration />
      <RemindersIntegration />
    </Section>
    <Section title="Apps" layout="stack">
      <HexIntegration />
    </Section>
  </SettingsPage>
);
