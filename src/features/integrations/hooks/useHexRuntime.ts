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

/** One catch-up, reported to the row. Shared by the runtime and "Sync now". */
export async function runHexCatchUp(): Promise<void> {
  const { syncStarted, syncFinished } = useHexSyncStore.getState();
  syncStarted();
  try {
    notifyImported(await hexSync.catchUp());
    syncFinished(null);
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
