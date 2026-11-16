/** Every integration as one row in a grouped card (rows come from features/integrations); only those this device has. */

import React from 'react';
import { Section } from '@shared/ui';
import { AppleIntelligenceIntegration, AppleNotesIntegration, CalendarIntegration, CodingAgentsIntegration, HexIntegration, RemindersIntegration, SpotlightIntegration, UrlActionsIntegration } from '@features/integrations';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { platform } from '@platform/index';
import { SettingsPage } from './shared';

const hasSystemIntegrations = platform.hasAppleIntelligence || platform.hasCalendar || platform.hasAppleNotes || platform.hasSpotlight;

/** Whether this device has any integration, so the panel is worth showing. */
export const hasIntegrations = hasSystemIntegrations || platform.hasHex || platform.hasCodingAgents || platform.hasUrlActions;

export const IntegrationsPanel: React.FC = () => (
  <SettingsPage title="Integrations" description="Connect Roci to apps on this Mac.">
    {hasSystemIntegrations && (
      <Section title="macOS" layout="stack">
        {platform.hasAppleIntelligence && <AppleIntelligenceIntegration />}
        {platform.hasCalendar && <CalendarIntegration />}
        {platform.hasCalendar && <RemindersIntegration />}
        {platform.hasAppleNotes && <AppleNotesIntegration />}
        {platform.hasSpotlight && <SpotlightIntegration />}
      </Section>
    )}
    {platform.hasHex && (
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
