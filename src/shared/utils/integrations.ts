/**
 * The integration gate. An integration's switch (Settings › Integrations) is the
 * only thing that decides whether its surfaces exist: every place that can use
 * an integration (model pickers, sync, …) asks here. On → it shows up; off → gone.
 */

import type { AppSettings } from '@shared/types';

export type IntegrationId = 'calendar' | 'reminders' | 'hex' | 'appleIntelligence';

const SETTING: Record<IntegrationId, keyof AppSettings> = {
  calendar: 'calendarIntegration',
  reminders: 'remindersIntegration',
  hex: 'hexIntegration',
  appleIntelligence: 'appleIntelligenceIntegration',
};

export function isIntegrationEnabled(settings: AppSettings, id: IntegrationId): boolean {
  const value = settings[SETTING[id]] as { enabled?: boolean } | undefined;
  return !!value?.enabled;
}
