/** The integration gate: an integration's switch, on a device that has it, alone decides whether any of its surfaces exist. */

import type { AppSettings } from '@shared/types';
import { platform, type PlatformCapability } from '@platform/index';

export type IntegrationId = 'calendar' | 'reminders' | 'hex' | 'appleIntelligence' | 'appleNotes' | 'spotlight';

const SETTING: Record<IntegrationId, keyof AppSettings> = {
  calendar: 'calendarIntegration',
  reminders: 'remindersIntegration',
  hex: 'hexIntegration',
  appleIntelligence: 'appleIntelligenceIntegration',
  appleNotes: 'appleNotesIntegration',
  spotlight: 'spotlightIntegration',
};

/** The capability each integration needs (Reminders goes through the same EventKit bridge as Calendar). */
const REQUIRES: Record<IntegrationId, PlatformCapability> = {
  calendar: 'hasCalendar',
  reminders: 'hasCalendar',
  hex: 'hasHex',
  appleIntelligence: 'hasAppleIntelligence',
  appleNotes: 'hasAppleNotes',
  spotlight: 'hasSpotlight',
};

/** Whether this device has the integration at all. */
export function isIntegrationAvailable(id: IntegrationId): boolean {
  return platform[REQUIRES[id]];
}

export function isIntegrationEnabled(settings: AppSettings, id: IntegrationId): boolean {
  const value = settings[SETTING[id]] as { enabled?: boolean } | undefined;
  return isIntegrationAvailable(id) && !!value?.enabled;
}
