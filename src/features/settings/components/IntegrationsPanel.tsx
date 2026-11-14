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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, CalendarDays } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { isTauriEnvironment } from '@services/tauri';
import { calendarService } from '@services/calendar';

import { CALENDAR_DEFAULTS } from '@services/calendar/types';
import type { CalendarAccessStatus } from '@services/calendar/types';
import { SettingsPage } from './shared';
import { Badge, Button, CardRow, Icon, Section, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Surface, Switch, Text } from '@shared/ui';

const NOTIFY_OPTIONS = [
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
] as const;

// ─── macOS Calendar Integration Card ────────────────────────────────────────

const CalendarIntegrationRows: React.FC = () => {
  const { setCurrentView } = useAppActions();
  const { settings, setSettings, isLoading } = useSettings();
  const { showToast } = useToast();

  const calendarSettings = settings.calendarIntegration ?? {
    enabled: CALENDAR_DEFAULTS.enabled,
    notifyMinutesBefore: CALENDAR_DEFAULTS.notify_minutes_before,
  };

  // null until macOS answers — no status rows render on a guess, so nothing flashes on mount.
  const [accessStatus, setAccessStatus] = useState<CalendarAccessStatus | null>(null);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);

  // Guard async completion after unmount (no setState on unmounted card).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const checkAccess = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    try {
      const status = await calendarService.checkAccess();
      if (mountedRef.current) setAccessStatus(status);
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
      if (!mountedRef.current) return granted;
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

  // Rendered after all hooks — never return early before them.
  if (isLoading) return null;

  return (
    <>
      {/* Header — icon + name + switch */}
      <div className="flex items-center gap-3 py-3">
        <Surface radius="lg" className="w-9 h-9 shrink-0 overflow-hidden">
          <img src="/images/macos-calendar-sm.png" alt="macOS Calendar" className="w-full h-full" />
        </Surface>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Text variant="bodyStrong">macOS Calendar</Text>
            {isConnected && <Badge variant="success">Connected</Badge>}
          </div>
          <Text as="p" variant="helper" tone="muted" className="mt-0.5">
            Get notified before meetings and auto-record. Works with Google, Outlook, iCloud, Exchange — no sign-in required.
          </Text>
        </div>
        <Switch size="sm" checked={calendarSettings.enabled} onCheckedChange={handleToggle} />
      </div>

      {/* Permission warning — only if denied */}
      {accessStatus === 'denied' && calendarSettings.enabled && (
        <CardRow
          title={<Text variant="bodyStrong" tone="danger">Calendar access denied by macOS</Text>}
          actions={
            <Button variant="link" size="inline" onClick={openSystemSettings}>
              <Icon icon={ExternalLink} size="xs" />
              Open System Settings
            </Button>
          }
        />
      )}

      {/* Permission request — first time */}
      {accessStatus === 'not_determined' && calendarSettings.enabled && (
        <CardRow
          title="macOS permission required"
          actions={
            <Button variant="primary" size="sm" onClick={requestAccess} disabled={isRequestingAccess}>
              {isRequestingAccess ? 'Requesting...' : 'Grant Access'}
            </Button>
          }
        />
      )}

      {/* Expanded settings — only when enabled + authorized */}
      {isConnected && (
        <>
          <CardRow
            title="Notify before meeting starts"
            actions={
              <div className="w-36">
                <Select
                  value={String(calendarSettings.notifyMinutesBefore)}
                  onValueChange={(val) => handleNotifyTimingChange(parseInt(val, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
          <CardRow
            title="View your upcoming week"
            actions={
              <Button variant="outline" size="sm" onClick={() => setCurrentView('calendar')}>
                <Icon icon={CalendarDays} size="xs" />
                View Schedule
              </Button>
            }
          />
        </>
      )}
    </>
  );
};

// ─── Main Integrations Panel ────────────────────────────────────────────────

export const IntegrationsPanel: React.FC = () => (
  <SettingsPage title="Integrations" description="Connect Kasset to your tools for a seamless meeting workflow.">
    <Section title="Calendar">
      <CalendarIntegrationRows />
    </Section>
  </SettingsPage>
);

export default IntegrationsPanel;
