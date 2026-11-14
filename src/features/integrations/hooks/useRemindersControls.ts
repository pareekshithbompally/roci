/**
 * useRemindersControls — macOS Reminders row: access, on/off, target list.
 * Turning it on creates the "Kasset" list (once) and sends the open to-dos.
 * (Change watching and completion sync live in useRemindersRuntime.)
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { remindersService, remindersSync, type RemindersList } from '@services/reminders';
import { queryKeys } from '@shared/query/queryKeys';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useSystemAccess } from './useSystemAccess';
import type { IntegrationControls } from '@features/integrations/types';

const SOURCE = {
  id: 'reminders',
  check: () => remindersService.checkAccess(),
  request: () => remindersService.requestAccess(),
  settingsPane: 'reminders-settings',
} as const;

export interface RemindersControls extends IntegrationControls {
  lists: RemindersList[];
  listId?: string;
  setListId: (id: string) => void;
}

export function useRemindersControls(): RemindersControls {
  const { settings, setSettings } = useSettings();
  const current = settings.remindersIntegration ?? { enabled: false };
  const { access, requestAccess, openSettings } = useSystemAccess(SOURCE);

  const { data: lists = [] } = useQuery({
    queryKey: queryKeys.remindersLists(),
    queryFn: () => remindersService.lists(),
    enabled: current.enabled && access === 'ready',
  });

  const turnOn = useCallback(async () => {
    const listId = current.listId ?? await remindersService.ensureList(INTEGRATIONS_CONFIG.reminders.defaultListTitle);
    setSettings({ remindersIntegration: { enabled: true, listId } });
    await remindersSync.sendOpen(listId);
  }, [current.listId, setSettings]);

  const setEnabled = useCallback(async (on: boolean) => {
    if (!on) return setSettings({ remindersIntegration: { ...current, enabled: false } });
    // Ask while macOS can still prompt; once denied, only Settings can change it.
    if (access === 'needs-settings') return openSettings();
    if (access === 'needs-request' && !(await requestAccess())) return;
    await turnOn();
  }, [access, current, openSettings, requestAccess, setSettings, turnOn]);

  return {
    access,
    enabled: current.enabled,
    setEnabled: (on) => { setEnabled(on).catch((e: unknown) => console.error('[useRemindersControls] toggle failed:', e)); },
    request: () => { requestAccess().catch((e: unknown) => console.error('[useRemindersControls] request failed:', e)); },
    openSettings,
    lists,
    listId: current.listId,
    setListId: (listId) => setSettings({ remindersIntegration: { ...current, listId } }),
  };
}
