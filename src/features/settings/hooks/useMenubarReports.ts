/** Reports what only the webview knows to the Rust-owned menu bar: background jobs and recent meetings. */

import { useEffect, useMemo } from 'react';
import { isTauriEnvironment, menubarService, type MenubarActivity, type MenubarRecentMeeting } from '@services/tauri';
import { useActivityItems } from '@shared/stores/activityStore';
import { useMeetingsFound } from '@shared/hooks/useMeetings';
import { APP_CONFIG } from '@config/app.config';

/** Percent as the menu shows it: a whole number 0–100, or null while unknown. */
const wholePercent = (percent: number | null) => (percent === null ? null : Math.min(100, Math.max(0, Math.round(percent))));

export function useMenubarReports(): void {
  const activityItems = useActivityItems();
  const meetings = useMeetingsFound({}, APP_CONFIG.tray.recentMeetings);

  // Running jobs only; recording has its own row, and a waiting update has its own row.
  const activity = useMemo<MenubarActivity[]>(
    () => activityItems
      .filter((item) => item.status === 'active' && item.type !== 'recording')
      .map((item) => ({ label: item.label, percent: wholePercent(item.percent) })),
    [activityItems],
  );

  const recent = useMemo<MenubarRecentMeeting[]>(
    () => meetings.map(({ id, title }) => ({ id, title })),
    [meetings],
  );

  useEffect(() => {
    if (isTauriEnvironment()) void menubarService.setActivity(activity);
  }, [activity]);

  useEffect(() => {
    if (isTauriEnvironment()) void menubarService.setRecentMeetings(recent);
  }, [recent]);
}
