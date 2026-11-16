/** The integration gate: an integration's switch, on a device that has it, alone decides whether any of its surfaces exist. */

import type { AppSettings } from '@shared/types';
import { platform } from '@platform/index';

export type IntegrationId = 'calendar' | 'reminders' | 'hex' | 'appleIntelligence' | 'appleNotes' | 'spotlight';

const SETTING: Record<IntegrationId, keyof AppSettings> = {
  calendar: 'calendarIntegration',
  reminders: 'remindersIntegration',
  hex: 'hexIntegration',
  appleIntelligence: 'appleIntelligenceIntegration',
  appleNotes: 'appleNotesIntegration',
  spotlight: 'spotlightIntegration',
};

/** Whether this device has the integration at all (Reminders goes through the same EventKit bridge as Calendar). */
const AVAILABLE: Record<IntegrationId, boolean> = {
  calendar: platform.hasCalendar,
  reminders: platform.hasCalendar,
  hex: platform.hasHex,
  appleIntelligence: platform.hasAppleIntelligence,
  appleNotes: platform.hasAppleNotes,
  spotlight: platform.hasSpotlight,
};

export function isIntegrationEnabled(settings: AppSettings, id: IntegrationId): boolean {
  const value = settings[SETTING[id]] as { enabled?: boolean } | undefined;
  return AVAILABLE[id] && !!value?.enabled;
}
