/** Mount once (App): while on, imports each meeting Hex finishes and hands it to the pipeline to summarize; catches up on missed ones. */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isTauriEnvironment } from '@services/tauri';
import { hexMeetings, hexSync } from '@services/hex';
import { meetingPipeline } from '@features/recording';
import { hexErrorMessage } from '@services/ai/transcription/hex';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useHexSyncStore } from '@features/integrations/stores/hexSyncStore';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { failureLogger } from '@shared/utils/errors';

/** Meetings that arrived from Hex, as a background notification. */
function notifyImported(count: number): void {
  if (count === 0) return;
  notifyAppEvent({
    id: 'hex-imports',
    kind: 'hexImports',
    tone: 'success',
    inFront: 'toast',
    title: count === 1 ? '1 meeting imported from Hex' : `${count} meetings imported from Hex`,
    body: 'Open Roci to see them.',
  });
}

/** Meetings a catch-up couldn't import, as the row's message; Sync now (or the next sync) tries them again. */
const failedMessage = (failed: number): string | null =>
  failed === 0 ? null : `${failed} ${failed === 1 ? 'meeting' : 'meetings'} couldn't be imported. Sync now to try again.`;

/** One catch-up, reported to the row; meetings that came without Hex's notes go to the pipeline to be summarized. Shared by
 *  the runtime and "Sync now". */
export async function runHexCatchUp(): Promise<void> {
  const { syncStarted, syncFinished } = useHexSyncStore.getState();
  syncStarted();
  try {
    const { imported, toSummarize, failed } = await hexSync.catchUp();
    notifyImported(imported);
    for (const meetingId of toSummarize) void meetingPipeline.run(meetingId);
    syncFinished(failedMessage(failed));
  } catch (error: unknown) {
    console.error('[useHexRuntime] Catch-up failed:', error);
    syncFinished(hexErrorMessage(error, 'Hex'));
  }
}

export function useHexRuntime(): void {
  const { settings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'hex');

  useEffect(() => {
    if (!isTauriEnvironment() || !enabled) return;
    const store = useHexSyncStore.getState();
    const report = failureLogger('useHexRuntime');

    hexMeetings.watch(true).catch(report('start watcher'));
    void runHexCatchUp();

    const onFinished = hexMeetings.onFinished((id) => {
      hexSync
        .finished(id)
        .then((meetingId) => {
          if (!meetingId) return;
          notifyImported(1);
          void meetingPipeline.run(meetingId);
        })
        .catch(report(`import ${id}`));
    });
    const onEvents = hexMeetings.onEventsState(store.setEvents);
    const onFocus = () => {
      const { lastSyncedAt, syncing } = useHexSyncStore.getState();
      const due = !lastSyncedAt || Date.now() - lastSyncedAt > INTEGRATIONS_CONFIG.hex.focusSyncIntervalMs;
      if (due && !syncing) void runHexCatchUp();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      onFinished.then((stop) => stop()).catch(report('unlisten finished'));
      onEvents.then((stop) => stop()).catch(report('unlisten events'));
      hexMeetings.watch(false).catch(report('stop watcher'));
      store.setEvents(null);
    };
  }, [enabled]);
}
