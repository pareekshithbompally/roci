/**
 * useHexRuntime — mount once (App). While the Hex integration is on:
 * holds Hex's meeting-finished stream (Rust watcher), imports each finished
 * meeting and summarizes it with the Summary model, and catches up on
 * meetings finished while Kasset was closed (on enable, launch and focus).
 * Off → the watcher stops; nothing else reaches Hex.
 */

import { useEffect, useRef } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { isTauriEnvironment } from '@services/tauri';
import { hexMeetings, hexSync, type SummaryContext } from '@services/hex';
import { hexErrorMessage } from '@services/ai/transcription/hex';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { useHexSyncStore } from '@features/integrations/stores/hexSyncStore';

/** One catch-up, reported to the row. Shared by the runtime and "Sync now". */
export async function runHexCatchUp(): Promise<void> {
  const { syncStarted, syncFinished } = useHexSyncStore.getState();
  syncStarted();
  try {
    await hexSync.catchUp();
    syncFinished(null);
  } catch (error: unknown) {
    console.error('[useHexRuntime] Catch-up failed:', error);
    syncFinished(hexErrorMessage(error, 'Hex'));
  }
}

export function useHexRuntime(): void {
  const { settings, providers } = useSettings();
  const { categories } = useHistoryData();
  const enabled = isIntegrationEnabled(settings, 'hex');

  // Latest app context for summaries, without re-subscribing on every change.
  const context = useRef<SummaryContext>({ settings, providers, categories });
  context.current = { settings, providers, categories };

  useEffect(() => {
    if (!isTauriEnvironment() || !enabled) return;
    const store = useHexSyncStore.getState();
    const report = (action: string) => (error: unknown) => console.error(`[useHexRuntime] ${action} failed:`, error);

    hexMeetings.watch(true).catch(report('start watcher'));
    void runHexCatchUp();

    const onFinished = hexMeetings.onFinished((id) => {
      hexSync.finished(id, context.current).catch(report(`import ${id}`));
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
