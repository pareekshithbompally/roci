/**
 * IntegrationsPanel Component
 *
 * Discover and manage third-party integrations.
 * Each integration is an expandable card with its own enable toggle,
 * permission flow, and configuration.
 *
 * Currently supported:
 * - macOS Calendar (EventKit) — meeting notifications + auto-record
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ExternalLink, CalendarDays } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { isTauriEnvironment } from '@services/tauri';
import { calendarService } from '@services/calendar';

import { CALENDAR_DEFAULTS } from '@services/calendar/types';
import type { CalendarAccessStatus } from '@services/calendar/types';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS, LAYOUT, COMPONENT } from '@config/theme.config';
import { SettingsSection, Toggle } from './shared';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui';

const NOTIFY_OPTIONS = [
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
] as const;

// ─── macOS Calendar Integration Card ────────────────────────────────────────

const CalendarIntegrationCard: React.FC = () => {
  const { setCurrentView } = useAppActions();
  const { settings, setSettings, isLoading } = useSettings();
  const { showToast } = useToast();

  const calendarSettings = settings.calendarIntegration ?? {
    enabled: CALENDAR_DEFAULTS.enabled,
    notifyMinutesBefore: CALENDAR_DEFAULTS.notify_minutes_before,
  };

  // Wait for settings to finish loading before checking calendar access
  if (isLoading) return null;

  const [accessStatus, setAccessStatus] = useState<CalendarAccessStatus>('not_determined');
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);

  const checkAccess = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    try {
      const status = await calendarService.checkAccess();
      setAccessStatus(status);
    } catch (error: unknown) {
      console.error('[IntegrationsPanel] Failed to check calendar access:', error);
    }
  }, []);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  const requestAccess = useCallback(async (): Promise<boolean> => {
    if (!isTauriEnvironment()) return false;
    setIsRequestingAccess(true);
    try {
      const granted = await calendarService.requestAccess();
      setAccessStatus(granted ? 'authorized' : 'denied');
      if (!granted) {
        showToast('Calendar access denied — enable in System Settings → Privacy → Calendars', 'error');
      }
      return granted;
    } catch (error: unknown) {
      console.error('[IntegrationsPanel] Failed to request access:', error);
      showToast('Failed to request calendar access', 'error');
      return false;
    } finally {
      setIsRequestingAccess(false);
    }
  }, [showToast]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      if (accessStatus === 'denied') {
        showToast('Calendar access denied — enable in System Settings → Privacy → Calendars', 'error');
        return;
      }
      if (accessStatus !== 'authorized') {
        const granted = await requestAccess();
        if (!granted) return;
      }
    }
    setSettings({
      calendarIntegration: { ...calendarSettings, enabled },
    });
  }, [accessStatus, calendarSettings, requestAccess, setSettings, showToast]);

  const handleNotifyTimingChange = useCallback((minutes: number) => {
    setSettings({
      calendarIntegration: { ...calendarSettings, notifyMinutesBefore: minutes },
    });
  }, [calendarSettings, setSettings]);

  const openSystemSettings = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars');
    } catch (error: unknown) {
      console.error('[IntegrationsPanel] Failed to open System Settings:', error);
    }
  }, []);

  const isConnected = calendarSettings.enabled && accessStatus === 'authorized';

  return (
    <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} overflow-hidden`}>
      {/* Card header — icon + name + toggle */}
      <div className="flex items-center gap-3 px-4 py-3">
        <img
          src="/images/macos-calendar-sm.png"
          alt="macOS Calendar"
          className="w-9 h-9 rounded-lg shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              macOS Calendar
            </span>
            {isConnected && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${TEXT.success} bg-green-500/10`}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            )}
          </div>
          <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
            Get notified before meetings and auto-record. Works with Google, Outlook, iCloud, Exchange — no sign-in required.
          </p>
        </div>
        <Toggle
          checked={calendarSettings.enabled}
          onChange={handleToggle}
        />
      </div>

      {/* Permission warning — only if denied */}
      {accessStatus === 'denied' && calendarSettings.enabled && (
        <div className={`px-4 py-2.5 border-t ${BORDER.default} bg-red-500/5`}>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs ${TEXT.error}`}>
              Calendar access denied by macOS
            </span>
            <button
              onClick={openSystemSettings}
              className={`flex items-center gap-1 text-xs ${TEXT.link} hover:underline shrink-0`}
            >
              <ExternalLink className="w-3 h-3" />
              Open System Settings
            </button>
          </div>
        </div>
      )}

      {/* Permission request — first time */}
      {accessStatus === 'not_determined' && calendarSettings.enabled && (
        <div className={`px-4 py-2.5 border-t ${BORDER.default} bg-yellow-500/5`}>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs ${TEXT.secondary}`}>
              macOS permission required
            </span>
            <button
              onClick={requestAccess}
              disabled={isRequestingAccess}
              className={`${COMPONENT.settingsButtonPrimary} disabled:opacity-50`}
            >
              {isRequestingAccess ? 'Requesting...' : 'Grant Access'}
            </button>
          </div>
        </div>
      )}

      {/* Expanded settings — only when enabled + authorized */}
      {isConnected && (
        <>
          <div className={`px-4 py-2.5 border-t ${BORDER.default}`}>
            <div className="flex items-center justify-between gap-4">
              <span className={`text-xs ${TEXT.muted}`}>
                Notify before meeting starts
              </span>
              <Select
                value={String(calendarSettings.notifyMinutesBefore)}
                onValueChange={(val) => handleNotifyTimingChange(parseInt(val, 10))}
              >
                <SelectTrigger className={`!w-[140px] h-7 ${TYPOGRAPHY_CLASSES.settingsInput}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className={`px-4 py-2.5 border-t ${BORDER.default}`}>
            <div className="flex items-center justify-between gap-4">
              <span className={`text-xs ${TEXT.muted}`}>
                View your upcoming week
              </span>
              <button
                onClick={() => setCurrentView('calendar')}
                className={COMPONENT.settingsButtonOutline}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                View Schedule
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Integrations Panel ────────────────────────────────────────────────

export const IntegrationsPanel: React.FC = () => {


  return (
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
      <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
        <div>
          <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
            Integrations
          </h3>
          <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
            Connect Kasset to your tools for a seamless meeting workflow.
          </p>
        </div>

        {/* Calendar section */}
        <SettingsSection title="Calendar">
          <CalendarIntegrationCard />
        </SettingsSection>


      </div>
    </div>
  );
};

export default IntegrationsPanel;
