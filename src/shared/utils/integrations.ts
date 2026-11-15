/** The integration gate: an integration's switch alone decides whether any of its surfaces exist. */

import type { AppSettings } from '@shared/types';

export type IntegrationId = 'calendar' | 'reminders' | 'hex' | 'appleIntelligence' | 'appleNotes' | 'spotlight';

const SETTING: Record<IntegrationId, keyof AppSettings> = {
  calendar: 'calendarIntegration',
  reminders: 'remindersIntegration',
  hex: 'hexIntegration',
  appleIntelligence: 'appleIntelligenceIntegration',
  appleNotes: 'appleNotesIntegration',
  spotlight: 'spotlightIntegration',
};

export function isIntegrationEnabled(settings: AppSettings, id: IntegrationId): boolean {
  const value = settings[SETTING[id]] as { enabled?: boolean } | undefined;
  return !!value?.enabled;
}
